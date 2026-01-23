"""
Custom tool based on Strands retrieve tool with added retrieval metadata
"""

import os
import json
import logging
import boto3


logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class NoResultsFoundError(ValueError):
    """Exception raised when no relevant results are found in the knowledge base."""


TOOL_SPEC = {
    "name": "kb_retrieve",
    "description": "Retrieves knowledge from Amazon Bedrock Knowledge Bases with semantic search.",
    "inputSchema": {
        "json": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Query text to search for"},
                "numberOfResults": {
                    "type": "integer",
                    "description": "Max results to return (default: 15)"
                },
                "knowledgeBaseId": {"type": "string", "description": "Knowledge base ID"},
                "region": {"type": "string", "description": "AWS region (default: us-west-2)"},
                "score": {
                    "type": "number",
                    "description": "Min score threshold (default: 0.3)",
                    "default": 0.4,
                    "minimum": 0.0,
                    "maximum": 1.0
                }
            },
            "required": ["text"]
        }
    }
}


def kb_retrieve(tool, **kwargs):
    tool_use_id = tool["toolUseId"]
    tool_input = tool["input"]
    try:
        # Get parameters
        query = tool_input["text"]
        kb_id = os.getenv("KNOWLEDGE_BASE_ID")
        region = os.getenv("AWS_REGION", "us-west-2")
        num_results = tool_input.get("numberOfResults", 15)
        min_score = tool_input.get("score", 0.4)
        # Call Bedrock
        client = boto3.client("bedrock-agent-runtime", region_name=region)
        response = client.retrieve(
            retrievalQuery={"text": query},
            knowledgeBaseId=kb_id,
            retrievalConfiguration={"vectorSearchConfiguration": {"numberOfResults": num_results}}
        )
        # Filter and format results as list of dicts
        results = response.get("retrievalResults", [])
        filtered = [r for r in results if r.get("score", 0) >= min_score]
        content = []

        for result in filtered:
            metadata = result.get("metadata", {})
            source_uri = metadata.get("x-amz-bedrock-kb-source-uri", "")
            doc_name = source_uri.split("/")[-1] if source_uri else "Unknown"
            result_text = {
                "score": result.get("score", 0),
                "doc": doc_name,
                "page": metadata.get("x-amz-bedrock-kb-document-page-number", "Unknown"),
                "doc_id": metadata.get("x-amz-bedrock-kb-data-source-id", "Unknown"),
                "content": result.get("content", {}).get("text", "")
            }

            content.append({"text": str(result_text)})
        # Check if content is empty after processing all results
        if not content:
            raise NoResultsFoundError(f"No relevant results found for query: '{query}'")
        result_to_return = {
            "toolUseId": tool_use_id,
            "status": "success",
            "content": content
        }
        logger.info("kb_retrieve query: '%s', found %s results", query, len(filtered))
        logger.info("kb_retrieve content: %s", json.dumps(content, indent=2))
        return result_to_return
    except NoResultsFoundError as e:
        query_term = str(e).split("'")[1] if "'" in str(e) else "this query"
        error_message = f"No relevant clauses found for '{query_term}'."


        logger.info("kb_retrieve query - NoResultsFoundError: %s", error_message)
        return {
            "toolUseId": tool_use_id,
            "status": "error",
            "content": [{"text": error_message}]
        }
    except Exception as e:

        logger.info("kb_retrieve error: %s", e)
        return {
            "toolUseId": tool_use_id,
            "status": "error",
            "content": [{"text": str(e)}]
        }
