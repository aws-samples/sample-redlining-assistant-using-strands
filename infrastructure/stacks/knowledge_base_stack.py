"""AWS CDK stack for Bedrock Knowledge Base with S3 and OpenSearch Serverless integration."""

from aws_cdk import (
    Stack,
    aws_bedrock as bedrock,
    aws_iam as iam,
    aws_s3 as s3,
    RemovalPolicy
)
from constructs import Construct


class KnowledgeBaseStack(Stack):
    """Creates Bedrock Knowledge Base with S3 data source and OpenSearch Serverless vector store."""
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        oss_collection_arn: str,
        oss_index_name: str,
        kb_role_arn: str,
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)
        # S3 bucket for access logs
        access_logs_bucket = s3.Bucket(
            self, "KnowledgeBaseBucketAccessLogs",
            bucket_name=f"redliner-kb-access-logs-{self.account}-{self.region}",
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
            enforce_ssl=True
        )

        # S3 bucket for Knowledge Base documents
        self.kb_bucket = s3.Bucket(
            self, "KnowledgeBaseBucket",
            bucket_name=f"redliner-kb-{self.account}-{self.region}",
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
            enforce_ssl=True,
            server_access_logs_bucket=access_logs_bucket,
            server_access_logs_prefix="knowledge-base-access-logs/"
        )
        # Add S3 permissions to the KB role (created in OSS stack)
        kb_role = iam.Role.from_role_arn(self, "ImportedKBRole", kb_role_arn)
        # Create and attach S3 policy to the KB role
        s3_policy = iam.Policy(
            self, "KBS3Policy",
            statements=[
                iam.PolicyStatement(
                    effect=iam.Effect.ALLOW,
                    actions=["s3:GetObject", "s3:ListBucket"],
                    resources=[
                        self.kb_bucket.bucket_arn,
                        f"{self.kb_bucket.bucket_arn}/*"
                    ]
                )
            ]
        )
        s3_policy.attach_to_role(kb_role)
        # Knowledge Base
        self.knowledge_base = bedrock.CfnKnowledgeBase(
            self, "RedlinerKnowledgeBase",
            name="redliner-kb",
            role_arn=kb_role_arn,
            knowledge_base_configuration=bedrock.CfnKnowledgeBase.KnowledgeBaseConfigurationProperty(
                type="VECTOR",
                vector_knowledge_base_configuration=bedrock.CfnKnowledgeBase.VectorKnowledgeBaseConfigurationProperty(
                    embedding_model_arn=(
                        f"arn:aws:bedrock:{self.region}::foundation-model/"
                        "amazon.titan-embed-text-v2:0"
                    )
                )
            ),
            storage_configuration=bedrock.CfnKnowledgeBase.StorageConfigurationProperty(
                type="OPENSEARCH_SERVERLESS",
                opensearch_serverless_configuration=bedrock.CfnKnowledgeBase.OpenSearchServerlessConfigurationProperty(
                    collection_arn=oss_collection_arn,
                    vector_index_name=oss_index_name,
                    field_mapping=bedrock.CfnKnowledgeBase.OpenSearchServerlessFieldMappingProperty(
                        vector_field="vector",
                        text_field="AMAZON_BEDROCK_TEXT",
                        metadata_field="AMAZON_BEDROCK_METADATA"
                    )
                )
            ),
            description="RAG Knowledge Base for Document Redlining"
        )
        # Knowledge Base Data Source
        self.kb_data_source = bedrock.CfnDataSource(
            self, "KnowledgeBaseDataSource",
            knowledge_base_id=self.knowledge_base.attr_knowledge_base_id,
            name="redliner-documents-source",
            description="Bedrock Knowledge Base DataSource Configuration",
            data_source_configuration=bedrock.CfnDataSource.DataSourceConfigurationProperty(
                type="S3",
                s3_configuration=bedrock.CfnDataSource.S3DataSourceConfigurationProperty(
                    bucket_arn=self.kb_bucket.bucket_arn
                )
            ),
            vector_ingestion_configuration=bedrock.CfnDataSource.VectorIngestionConfigurationProperty(
                chunking_configuration=bedrock.CfnDataSource.ChunkingConfigurationProperty(
                    chunking_strategy="FIXED_SIZE",
                    fixed_size_chunking_configuration=bedrock.CfnDataSource.FixedSizeChunkingConfigurationProperty(
                        max_tokens=300,
                        overlap_percentage=20
                    )
                )
            )
        )
        # Export values
        self.knowledge_base_id = self.knowledge_base.attr_knowledge_base_id
        self.data_source_id = self.kb_data_source.attr_data_source_id
        self.bucket_name = self.kb_bucket.bucket_name
        
        # S3 bucket for agent deployment package access logs
        deployment_access_logs_bucket = s3.Bucket(
            self, "AgentDeploymentBucketAccessLogs",
            bucket_name=f"redliner-deployment-access-logs-{self.account}-{self.region}",
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
            enforce_ssl=True
        )
        
        # S3 bucket for agent deployment package
        self.agent_deployment_bucket = s3.Bucket(
            self, "AgentDeploymentBucket",
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
            enforce_ssl=True,
            server_access_logs_bucket=deployment_access_logs_bucket,
            server_access_logs_prefix="agent-deployment-access-logs/"
        )
