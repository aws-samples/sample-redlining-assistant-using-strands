import os
import logging
import json
from strands import Agent, tool
from strands.models import BedrockModel
from bedrock_agentcore import BedrockAgentCoreApp
import kb_retrieve
from prompts import PROMPTS
from utils import remove_thinking_tags, convert_from_placeholders, convert_to_placeholders

# Set up Logs
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
logging.basicConfig(format="%(levelname)s | %(message)s", handlers=[logging.StreamHandler()])

# Optional - use Strands logger
# strands_logger = logging.getLogger("strands")
# strands_logger.setLevel(logging.DEBUG)

app = BedrockAgentCoreApp()


@tool
def microsoft_actions_tool(actions: str) -> str:
    """
    Tool for submitting Microsoft Word actions.
    
    Args:
        actions: JSON string containing the Microsoft actions to execute
    
    Returns:
        String confirming submission success.
    """
    logger.info("microsoft_actions_tool called with input: %s", actions)
    return "Action submitted successfully. It is for the user to decide whether to accept or decline your proposed change. DO NOT RESPOND FURTHER."


@tool
def knowledge_agent(query: str) -> str:
    """
    Process knowledge base retrieval queries.
    """
    append_response = """
    ONLY ADD specific retrieved results into your 'kb_options' that you intend to show to the user.
    - If showing these clauses conversationally (no document modification): Create {"action": "none", "kb_options": [...]}
    - If modifying document text specifically with KB content: Add "kb_options": [...] to the append/prepend/replace action with "new_text": "", and for each option add a 'formatted_content' field with EXACTLY the same content as 'retrieved_content' but with section numbers amended to ensure they flow logically within the word_document.
    - Keep kb_options separate from unrelated modifications - if the user requests other changes (delete, add user text, format), create separate actions WITHOUT kb_options.
    """
    try:
        logger.info("Knowledge Agent called with query: %s", query)
        bedrock_model = BedrockModel(model_id=os.environ['MODEL_ID'], temperature=0.4)
        kb_agent = Agent(
            model=bedrock_model,
            system_prompt=PROMPTS['knowledge_base'],
            tools=[kb_retrieve]
        )
        response = kb_agent(query)
        logger.info("Knowledge Agent response: %s", response)
        logger.info("Knowledge Agent Execution time: %s seconds", f"{sum(response.metrics.cycle_durations):.2f}")
        
        response_str = remove_thinking_tags(str(response))
        return f"{response_str} \n IMPORTANT: {append_response}"
    except Exception as e:
        logger.error("Error in knowledge agent: %s", str(e))
        return f"Error in knowledge agent: {str(e)}"


# Initialize redliner agent
bedrock_model = BedrockModel(model_id=os.environ['MODEL_ID'], temperature=0.4)

redliner_agent = Agent(
    model=bedrock_model,
    system_prompt=PROMPTS['redliner'],
    tools=[knowledge_agent, microsoft_actions_tool]
)


@app.entrypoint
async def agent_invocation(payload):
    """Handler for agent invocation"""
    logger.info("Received payload: %s", payload)
    
    # Extract message data from payload (matching Lambda's structure)
    messages = payload.get("messages", [])
    if not messages:
        # Fallback to simple prompt if messages not provided
        user_message = payload.get("prompt", "No prompt found in input")
    else:
        latest_message = messages[-1]
        user_input = latest_message['content'][0]['text']
        word_document = latest_message.get('word_document', '')
        highlighted = latest_message.get('highlighted', '')
        
        logger.info("User input length: %d, Word document length: %d", 
                   len(user_input), len(word_document))
        
        # Convert to placeholders
        word_document = convert_to_placeholders(word_document)
        highlighted = convert_to_placeholders(highlighted)
        highlighted_section = f"<highlighted>{highlighted}</highlighted>" if highlighted else ""
        
        # Build prompt for redliner
        user_message = f"<word_document>{word_document}</word_document>\n{highlighted_section}\n<user_input>{user_input}</user_input>"
    
    # Stream redliner response
    stream = redliner_agent.stream_async(user_message)
    
    # Track state for filtering and batching
    text_buffer = []
    TEXT_BATCH_SIZE = 3
    
    async for event in stream:
        logger.info("Raw stream event: %s", event)
        
        # Check if this is a text chunk (Strands format)
        if "data" in event:
            text = remove_thinking_tags(event["data"])
            text = convert_from_placeholders(text)
            
            # Skip empty or blank text chunks
            if text and text.strip() != "[blank text]":
                text_buffer.append(text)
                
                # Flush when buffer reaches batch size
                if len(text_buffer) >= TEXT_BATCH_SIZE:
                    yield {"type": "content", "data": "".join(text_buffer)}
                    text_buffer.clear()
        
        # Check for Bedrock events
        elif "event" in event:
            event_type = event["event"]
            
            # Tool use start - shows badge immediately
            if "contentBlockStart" in event_type:
                start = event_type["contentBlockStart"].get("start", {})
                if "toolUse" in start:
                    tool_name = start["toolUse"].get("name")
                    if tool_name:
                        # Flush text buffer before showing tool badge
                        if text_buffer:
                            yield {"type": "content", "data": "".join(text_buffer)}
                            text_buffer.clear()
                        
                        yield {
                            "type": "tool_use",
                            "tool_name": tool_name
                        }
            
            # End turn
            elif "messageStop" in event_type:
                if event_type["messageStop"].get("stopReason") == "end_turn":
                    # Flush remaining text
                    if text_buffer:
                        yield {"type": "content", "data": "".join(text_buffer)}
                        text_buffer.clear()
                    
                    yield {"type": "end_turn"}
        
        # Check for complete message with microsoft_actions_tool
        elif "message" in event:
            # Flush remaining text first
            if text_buffer:
                yield {"type": "content", "data": "".join(text_buffer)}
                text_buffer.clear()
            
            message = event["message"]
            if message.get("role") == "assistant":
                for item in message.get("content", []):
                    if "toolUse" in item:
                        tool_use = item["toolUse"]
                        tool_name = tool_use.get("name")
                        
                        if tool_name == "microsoft_actions_tool":
                            try:
                                actions = json.loads(tool_use["input"]["actions"])
                                
                                # Convert placeholders in new_text fields
                                for action in actions:
                                    if "new_text" in action:
                                        action["new_text"] = convert_from_placeholders(action["new_text"])
                                
                                yield {
                                    "type": "microsoft_actions",
                                    "actions": actions
                                }
                            except Exception as e:
                                logger.error("Failed to parse microsoft_actions: %s", str(e))


if __name__ == "__main__":
    app.run()
             
         