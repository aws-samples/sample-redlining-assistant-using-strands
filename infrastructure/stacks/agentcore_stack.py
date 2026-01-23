"""AWS CDK stack for AgentCore Runtime."""

from aws_cdk import (
    Stack,
    aws_iam as iam,
    aws_s3 as s3,
    aws_bedrockagentcore as bedrockagentcore,
    aws_cognito as cognito,
    CfnOutput,
    RemovalPolicy,
)
from constructs import Construct


class AgentCoreStack(Stack):
    """Creates AgentCore Runtime infrastructure."""
    
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        bucket: s3.IBucket,
        knowledge_base_id: str,
        model_id: str,
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)
        
        # Cognito User Pool for direct AgentCore invocation
        user_pool = cognito.UserPool(
            self, "AgentCoreUserPool",
            user_pool_name="agentcore-user-pool",
            feature_plan=cognito.FeaturePlan.PLUS,
            password_policy=cognito.PasswordPolicy(
                min_length=8,
                require_lowercase=True,
                require_uppercase=True,
                require_digits=True,
                require_symbols=True
            ),
            removal_policy=RemovalPolicy.DESTROY,
            mfa=cognito.Mfa.REQUIRED,
            mfa_second_factor=cognito.MfaSecondFactor(
                sms=False,
                otp=True,
                email=False
            ),
            self_sign_up_enabled=True,
            sign_in_aliases=cognito.SignInAliases(email=True),
            standard_attributes=cognito.StandardAttributes(
                email=cognito.StandardAttribute(required=True),
                given_name=cognito.StandardAttribute(required=True),
                family_name=cognito.StandardAttribute(required=True)
            ),
            standard_threat_protection_mode=cognito.StandardThreatProtectionMode.FULL_FUNCTION
        )

        # Cognito User Pool Client
        user_pool_client = user_pool.add_client(
            "AgentCoreUserPoolClient",
            user_pool_client_name="agentcore-client",
            auth_flows=cognito.AuthFlow(
                user_password=True,
                user_srp=True
            )
        )

        # Risk Configuration Attachment
        cognito.CfnUserPoolRiskConfigurationAttachment(
            self, "AgentCoreUserPoolRiskConfig",
            user_pool_id=user_pool.user_pool_id,
            client_id="ALL",
            compromised_credentials_risk_configuration=cognito.CfnUserPoolRiskConfigurationAttachment.CompromisedCredentialsRiskConfigurationTypeProperty(
                actions=cognito.CfnUserPoolRiskConfigurationAttachment.CompromisedCredentialsActionsTypeProperty(
                    event_action="BLOCK"
                ),
                event_filter=["SIGN_IN", "SIGN_UP", "PASSWORD_CHANGE"]
            ),
            account_takeover_risk_configuration=cognito.CfnUserPoolRiskConfigurationAttachment.AccountTakeoverRiskConfigurationTypeProperty(
                actions=cognito.CfnUserPoolRiskConfigurationAttachment.AccountTakeoverActionsTypeProperty(
                    high_action=cognito.CfnUserPoolRiskConfigurationAttachment.AccountTakeoverActionTypeProperty(
                        event_action="BLOCK",
                        notify=False
                    ),
                    medium_action=cognito.CfnUserPoolRiskConfigurationAttachment.AccountTakeoverActionTypeProperty(
                        event_action="BLOCK", 
                        notify=False
                    ),
                    low_action=cognito.CfnUserPoolRiskConfigurationAttachment.AccountTakeoverActionTypeProperty(
                        event_action="BLOCK",
                        notify=False
                    )
                )
            )
        )
        
        # AgentCore Runtime execution role
        agentcore_role = iam.Role(
            self, "AgentCoreRuntimeRole",
            assumed_by=iam.ServicePrincipal("bedrock-agentcore.amazonaws.com"),
            inline_policies={
                "AgentCoreRuntimePolicy": iam.PolicyDocument(
                    statements=[
                        iam.PolicyStatement(
                            effect=iam.Effect.ALLOW,
                            actions=[
                                "bedrock:InvokeModel",
                                "bedrock:InvokeModelWithResponseStream",
                                "bedrock:Retrieve"
                            ],
                            resources=[
                                "arn:aws:bedrock:*::foundation-model/*",
                                f"arn:aws:bedrock:*:{self.account}:inference-profile/*",
                                f"arn:aws:bedrock:{self.region}:{self.account}:knowledge-base/{knowledge_base_id}"
                            ]
                        ),
                        iam.PolicyStatement(
                            effect=iam.Effect.ALLOW,
                            actions=["bedrock-agentcore:*"],
                            resources=["*"]
                        ),
                        iam.PolicyStatement(
                            effect=iam.Effect.ALLOW,
                            actions=[
                                "xray:PutTraceSegments",
                                "xray:PutTelemetryRecords",
                                "xray:GetSamplingRules",
                                "xray:GetSamplingTargets"
                            ],
                            resources=["*"]
                        ),
                        iam.PolicyStatement(
                            effect=iam.Effect.ALLOW,
                            actions=[
                                "logs:CreateLogGroup",
                                "logs:CreateLogStream",
                                "logs:PutLogEvents",
                                "logs:DescribeLogGroups",
                                "logs:DescribeLogStreams"
                            ],
                            resources=[
                                f"arn:aws:logs:{self.region}:{self.account}:log-group:/aws/bedrock-agentcore/runtimes/*",
                                f"arn:aws:logs:{self.region}:{self.account}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*",
                                f"arn:aws:logs:{self.region}:{self.account}:log-group:/aws/spans/*",
                                f"arn:aws:logs:{self.region}:{self.account}:log-group:/aws/spans/*:log-stream:*",
                                f"arn:aws:logs:{self.region}:{self.account}:log-group:*"
                            ]
                        ),
                        iam.PolicyStatement(
                            effect=iam.Effect.ALLOW,
                            actions=["cloudwatch:PutMetricData"],
                            resources=["*"],
                            conditions={
                                "StringEquals": {
                                    "cloudwatch:namespace": "bedrock-agentcore"
                                }
                            }
                        ),
                        iam.PolicyStatement(
                            effect=iam.Effect.ALLOW,
                            actions=["s3:GetObject"],
                            resources=[f"{bucket.bucket_arn}/*"]
                        )
                    ]
                )
            }
        )
        
        # AgentCore Runtime with JWT authorizer for direct frontend invocation
        agentcore_runtime_direct = bedrockagentcore.CfnRuntime(
            self, "RedlinerAgentRuntime",
            agent_runtime_name="redliner_agent",
            agent_runtime_artifact=bedrockagentcore.CfnRuntime.AgentRuntimeArtifactProperty(
                code_configuration=bedrockagentcore.CfnRuntime.CodeConfigurationProperty(
                    code=bedrockagentcore.CfnRuntime.CodeProperty(
                        s3=bedrockagentcore.CfnRuntime.S3LocationProperty(
                            bucket=bucket.bucket_name,
                            prefix="deployment_package.zip"
                        )
                    ),
                    entry_point=["opentelemetry-instrument", "main.py"],
                    runtime="PYTHON_3_13"
                )
            ),
            network_configuration=bedrockagentcore.CfnRuntime.NetworkConfigurationProperty(
                network_mode="PUBLIC"
            ),
            role_arn=agentcore_role.role_arn,
            description="Redliner agent runtime with JWT auth for direct frontend invocation",
            environment_variables={
                "MODEL_ID": model_id,
                "KNOWLEDGE_BASE_ID": knowledge_base_id,
                "AWS_REGION": self.region
            },
            authorizer_configuration={
                "customJwtAuthorizer": {
                    "discoveryUrl": f"https://cognito-idp.{self.region}.amazonaws.com/{user_pool.user_pool_id}/.well-known/openid-configuration",
                    "allowedClients": [user_pool_client.user_pool_client_id]
                }
            }
        )
        
        CfnOutput(
            self, "RedlinerAgentRuntimeArn",
            value=agentcore_runtime_direct.attr_agent_runtime_arn,
            description="Redliner Agent Runtime ARN with JWT auth for direct invocation"
        )
        
        CfnOutput(
            self, "AgentCoreUserPoolId",
            value=user_pool.user_pool_id,
            description="Cognito User Pool ID for AgentCore direct invocation"
        )
        
        CfnOutput(
            self, "AgentCoreUserPoolClientId",
            value=user_pool_client.user_pool_client_id,
            description="Cognito User Pool Client ID for AgentCore direct invocation"
        )
