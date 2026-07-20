export type TenantAiBootstrapStep =
  | "assistant_settings"
  | "ai_provider_connection"
  | "embedding_connection"
  | "vector_store_connection"
  | "knowledge_collection"
  | "retrieval_policy"
  | "execution_policy"
  | "vector_search_policy"
  | "prompt_templates";

export type TenantAiBootstrapStepResult = {
  step: TenantAiBootstrapStep;
  created: boolean;
  skipped: boolean;
  resourceId?: string;
  detail?: string;
};

export type TenantAiBootstrapResult = {
  companyId: string;
  skipped: boolean;
  reason?: string;
  steps: TenantAiBootstrapStepResult[];
};

export type TenantAiBootstrapOptions = {
  openAiApiKey?: string | null;
  userId?: string | null;
};

export type ServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
};

export type TenantAiBootstrapVerification = {
  hasAssistantSettings: boolean;
  aiProviderConnectionCount: number;
  embeddingConnectionCount: number;
  vectorStoreConnectionCount: number;
  defaultCollectionCount: number;
  retrievalPolicyCount: number;
  executionPolicyCount: boolean;
  vectorSearchPolicyCount: boolean;
  promptTemplateCount: number;
};
