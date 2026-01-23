#!/usr/bin/env python3
"""AWS CDK application entry point."""

import aws_cdk as cdk
from stacks.opensearch_stack import OpenSearchServerlessStack
from stacks.knowledge_base_stack import KnowledgeBaseStack
from stacks.agentcore_stack import AgentCoreStack

app = cdk.App()

# Get model_id from context, default to Sonnet 4
model_id = app.node.try_get_context("model_id") or "global.anthropic.claude-sonnet-4-20250514-v1:0"

# Create OpenSearch Serverless stack
oss_stack = OpenSearchServerlessStack(
    app, "OpenSearchStack"
)

# Create Knowledge Base stack (includes agent deployment bucket)
kb_stack = KnowledgeBaseStack(
    app, "KnowledgeBaseStack",
    oss_collection_arn=oss_stack.collection_arn,
    oss_index_name=oss_stack.index_name,
    kb_role_arn=oss_stack.kb_role_arn,
)
kb_stack.add_dependency(oss_stack)

# Create AgentCore stack (requires bucket from KB stack)
agentcore_stack = AgentCoreStack(
    app, "AgentCoreStack",
    bucket=kb_stack.agent_deployment_bucket,
    knowledge_base_id=kb_stack.knowledge_base_id,
    model_id=model_id
)
agentcore_stack.add_dependency(kb_stack)

app.synth()
