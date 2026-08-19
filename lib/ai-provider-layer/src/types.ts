import type {
  AIProviderKey,
  ProviderConnectionStatus,
  ProviderHealthStatus,
} from "./constants.js";

export type JsonSchema = Record<string, unknown>;

export type AIProviderDefinitionRecord = {
  id: string;
  key: AIProviderKey | string;
  display_name: string;
  description: string;
  icon: string | null;
  supports_generate: boolean;
  supports_classify: boolean;
  supports_embed: boolean;
  supports_streaming: boolean;
  configuration_schema: JsonSchema;
  default_configuration: Record<string, unknown>;
  is_active: boolean;
  version: string;
  created_at: string;
  updated_at: string;
};

export type AIProviderConnectionRecord = {
  id: string;
  company_id: string;
  provider_id: string;
  display_name: string;
  status: ProviderConnectionStatus;
  configuration: Record<string, unknown>;
  is_default: boolean;
  is_enabled: boolean;
  health_status: ProviderHealthStatus;
  last_health_check: string | null;
  uses_platform_key?: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  ai_provider_definition?: AIProviderDefinitionRecord | null;
};

export type CreateAIProviderConnectionInput = {
  companyId: string;
  providerId: string;
  displayName: string;
  configuration?: Record<string, unknown>;
  isDefault?: boolean;
  isEnabled?: boolean;
  status?: ProviderConnectionStatus;
  healthStatus?: ProviderHealthStatus;
};

export type UpdateAIProviderConnectionInput = {
  connectionId: string;
  configuration?: Record<string, unknown>;
  displayName?: string;
  status?: ProviderConnectionStatus;
  isEnabled?: boolean;
  isDefault?: boolean;
};

export type UpdateAIProviderConnectionHealthInput = {
  connectionId: string;
  healthStatus: ProviderHealthStatus;
  lastHealthCheck?: string | null;
};

export type ListAIProviderConnectionsFilter = {
  companyId: string;
  isEnabled?: boolean;
  healthStatus?: ProviderHealthStatus;
  providerKey?: string;
};

export type ServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
};

export type ProviderTokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  /** Present only when values came from provider usage metadata. */
  source?: "provider";
};

export type GenerateMetadata = {
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  response_format?: string;
  streaming?: boolean;
  onChunk?: (chunk: string) => void;
  companyId?: string;
  conversationId?: string;
  executionId?: string;
  correlationId?: string;
  chatMessages?: Array<{
    role: "system" | "developer" | "user" | "assistant" | "tool";
    content: string;
    tool_call_id?: string;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  }>;
  tools?: unknown[];
  toolChoice?: "auto" | "none";
};

export type GenerateInput = {
  prompt: string;
  model?: string;
  metadata?: GenerateMetadata;
};

export type GenerateResult = {
  text: string;
  model: string;
  providerKey: string;
  mock?: boolean;
  tokenUsage?: ProviderTokenUsage;
  finishReason?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  rawAssistantMessage?: Record<string, unknown>;
};

export type ClassifyInput = {
  text: string;
  labels?: string[];
  metadata?: Record<string, unknown>;
};

export type ClassifyResult = {
  label: string;
  confidence: number;
  providerKey: string;
  mock?: boolean;
};

export type EmbedInput = {
  text: string;
  model?: string;
  metadata?: Record<string, unknown>;
};

export type EmbedResult = {
  vector: number[];
  dimensions: number;
  model: string;
  providerKey: string;
  mock?: boolean;
};

export type HealthResult = {
  status: ProviderHealthStatus;
  providerKey: string;
  message: string;
  checkedAt: string;
  mock?: boolean;
};

export type ModelInfo = {
  id: string;
  displayName: string;
  supportsGenerate: boolean;
  supportsClassify: boolean;
  supportsEmbed: boolean;
};

export type ModelsResult = {
  models: ModelInfo[];
  providerKey: string;
  mock?: boolean;
};

export type ConfigurationValidationResult = {
  valid: boolean;
  errors: string[];
};

export type ResolveProviderInput = {
  providerKey: string;
  configuration: Record<string, unknown>;
};

export type ProviderHealthCheckResult = {
  connectionId: string;
  providerKey: string;
  healthStatus: ProviderHealthStatus;
  message: string;
  checkedAt: string;
};
