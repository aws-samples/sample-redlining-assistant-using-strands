"""AWS CDK stack for OpenSearch Serverless collection and index for Bedrock Knowledge Base."""

import json
from aws_cdk import (
    Stack,
    aws_iam as iam,
    aws_opensearchserverless as aoss
)
from constructs import Construct


class OpenSearchServerlessStack(Stack):
    """Creates OpenSearch Serverless collection and index with IAM roles and policies."""
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        collection_name = "redliner-kb"
        index_name = "redliner-index"

        # Bedrock Knowledge Base service role
        self.kb_role = iam.Role(
            self, "BedrockKBServiceRole",
            role_name="BedrockKBServiceRole",
            assumed_by=iam.ServicePrincipal(
                "bedrock.amazonaws.com",
                conditions={
                    "StringEquals": {
                        "aws:SourceAccount": self.account
                    },
                    "ArnLike": {
                        "aws:SourceArn": (
                            f"arn:aws:bedrock:{self.region}:{self.account}:"
                            "knowledge-base/*"
                        )
                    }
                }
            ),

            inline_policies={
                "EmbeddingModelAccess": iam.PolicyDocument(
                    statements=[
                        iam.PolicyStatement(
                            actions=["bedrock:InvokeModel"],
                            resources=[
                                f"arn:aws:bedrock:{self.region}::foundation-model/amazon.titan-embed-text-v2:0"
                            ]
                        )
                    ]
                )
            }
        )
        # Create policies
        network_policy = json.dumps([{
            "Description": f"Public access for {collection_name} collection",
            "Rules": [{
                "ResourceType": "collection",
                "Resource": [f"collection/{collection_name}"]
            }],
            "AllowFromPublic": True
        }])
        encryption_policy = json.dumps({
            "Rules": [{
                "ResourceType": "collection",
                "Resource": [f"collection/{collection_name}"]
            }],
            "AWSOwnedKey": True
        })
        data_access_policy = json.dumps([{
            "Rules": [{
                "Resource": [f"collection/{collection_name}"],
                "Permission": [
                    "aoss:CreateCollectionItems",
                    "aoss:DeleteCollectionItems",
                    "aoss:UpdateCollectionItems",
                    "aoss:DescribeCollectionItems"
                ],
                "ResourceType": "collection"
            }, {
                "Resource": [f"index/{collection_name}/*"],
                "Permission": [
                    "aoss:CreateIndex",
                    "aoss:DeleteIndex",
                    "aoss:UpdateIndex",
                    "aoss:DescribeIndex",
                    "aoss:ReadDocument",
                    "aoss:WriteDocument"
                ],
                "ResourceType": "index"
            }],
            "Principal": [
                self.kb_role.role_arn,
                f"arn:aws:iam::{self.account}:root"
            ]
        }])
        # Create CFN resources for policies
        cfn_data_access_policy = aoss.CfnAccessPolicy(
            self, "BedrockKBDataAccessPolicy",
            name=f"{collection_name}-ap",
            policy=data_access_policy,
            type="data"
        )
        cfn_network_policy = aoss.CfnSecurityPolicy(
            self, "BedrockKBNetworkPolicy",
            name=f"{collection_name}-np",
            policy=network_policy,
            type="network"
        )
        cfn_encryption_policy = aoss.CfnSecurityPolicy(
            self, "BedrockKBEncryptionPolicy",
            name=f"{collection_name}-ep",
            policy=encryption_policy,
            type="encryption"
        )
        # Create AOSS Collection
        self.oss_collection = aoss.CfnCollection(
            self, "BedrockKBCollection",
            name=collection_name,
            type="VECTORSEARCH",
            description="Collection for Bedrock Knowledge Base"
        )
        # Add dependencies
        self.oss_collection.add_dependency(cfn_data_access_policy)
        self.oss_collection.add_dependency(cfn_network_policy)
        self.oss_collection.add_dependency(cfn_encryption_policy)
        # Create OpenSearch Serverless Index
        self.oss_index = aoss.CfnIndex(
            self, "BedrockKBIndex",
            collection_endpoint=self.oss_collection.attr_collection_endpoint,
            index_name=index_name,
            mappings=aoss.CfnIndex.MappingsProperty(
                properties={
                    "vector": aoss.CfnIndex.PropertyMappingProperty(
                        type="knn_vector",
                        dimension=1024,
                        method=aoss.CfnIndex.MethodProperty(
                            name="hnsw",
                            engine="faiss",
                            space_type="l2",
                            parameters=aoss.CfnIndex.ParametersProperty(
                                ef_construction=512,
                                m=16
                            )
                        )
                    ),
                    "AMAZON_BEDROCK_METADATA": aoss.CfnIndex.PropertyMappingProperty(
                        type="text",
                        index=False
                    ),
                    "AMAZON_BEDROCK_TEXT": aoss.CfnIndex.PropertyMappingProperty(
                        type="text"
                    ),
                    "AMAZON_BEDROCK_TEXT_CHUNK": aoss.CfnIndex.PropertyMappingProperty(
                        type="text"
                    )
                }
            ),
            settings=aoss.CfnIndex.IndexSettingsProperty(
                index=aoss.CfnIndex.IndexProperty(
                    knn=True
                )
            )
        )
        self.oss_index.add_dependency(self.oss_collection)
        
        # Create separate OpenSearch policy with specific collection ARN
        opensearch_policy = iam.Policy(
            self, "OpenSearchServerlessPolicy",
            statements=[
                iam.PolicyStatement(
                    actions=["aoss:APIAccessAll"],
                    resources=[self.oss_collection.attr_arn]
                )
            ]
        )
        
        # Attach OpenSearch policy to KB role
        opensearch_policy.attach_to_role(self.kb_role)
        
        # Export values
        self.collection_arn = self.oss_collection.attr_arn
        self.collection_endpoint = self.oss_collection.attr_collection_endpoint
        self.collection_name = collection_name
        self.index_name = index_name
        self.kb_role_arn = self.kb_role.role_arn
