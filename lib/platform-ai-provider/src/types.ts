export type PlatformAIUseCase = "chat" | "tool_calling" | "embeddings" | "vision" | "audio";

export type PlatformAIFeatureKey =
  | "ai_chat"
  | "tool_calling"
  | "knowledge"
  | "automation"
  | "voice"
  | "embeddings";

export type PlatformAIProviderRecord = {
  id: string;
  provider_key: string;
  display_name: string;
  description: string;
  is_enabled: boolean;
  configuration: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type PlatformAIModelRecord = {
  id: string;
  provider_id: string;
  use_case: PlatformAIUseCase;
  model_name: string;
  is_default: boolean;
  is_enabled: boolean;
  configuration: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type PlatformAIProviderKeyRecord = {
  id: string;
  provider_id: string;
  key_label: string;
  key_hint: string | null;
  is_active: boolean;
  rotated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformAIFeatureFlagRecord = {
  id: string;
  company_id: string;
  feature_key: PlatformAIFeatureKey;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type PlatformAIUsageRecord = {
  id: string;
  company_id: string;
  user_id: string | null;
  provider_key: string;
  model: string;
  use_case: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number | null;
  latency_ms: number | null;
  status: string;
  error_code: string | null;
  conversation_id: string | null;
  execution_id: string | null;
  recorded_at: string;
};

export type PlatformAIRuntimeConfig = {
  providerKey: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  useCase: PlatformAIUseCase;
  usesPlatformKey: boolean;
};

export type UpsertPlatformProviderKeyInput = {
  providerId: string;
  apiKey: string;
  keyLabel?: string;
};

export type UpsertPlatformModelInput = {
  providerId: string;
  useCase: PlatformAIUseCase;
  modelName: string;
  isDefault?: boolean;
};

export type ServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
};

export type RecordPlatformUsageInput = {
  companyId: string;
  userId?: string | null;
  providerKey: string;
  model: string;
  useCase?: PlatformAIUseCase;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number | null;
  latencyMs?: number | null;
  status?: "succeeded" | "failed" | "timeout" | "denied";
  errorCode?: string | null;
  conversationId?: string | null;
  executionId?: string | null;
};
