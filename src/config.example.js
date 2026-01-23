// AWS Configuration Template
// Copy this to config.js and fill in your actual values from CDK outputs

export const config = {
  userPoolId: "your-user-pool-id", // From CDK output: AgentCoreUserPoolId
  userPoolClientId: "your-client-id", // From CDK output: AgentCoreUserPoolClientId
  region: "us-east-1", // Your AWS region
  agentCoreRuntimeArn: "your-runtime-arn", // From CDK output: RedlinerAgentRuntimeArn (full ARN)
};
