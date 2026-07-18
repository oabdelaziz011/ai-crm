import type {
  EmbeddingJobStatus,
  EmbeddingStatus,
  ProviderConnectionStatus,
  ProviderHealthStatus,
} from "./constants.js";

export type JsonSchema = Record<string, unknown>;

export type ServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
};

export type EmbeddingProviderDefinitionRecord = {
  id: string;
  key: string;
  display_name: string;
  description: string;
  icon: string | null;
  default_model: string;
  default_dimensions: number;
  configuration_schema: JsonSchema;
  default_configuration: Record<string, unknown>;
  is_active: boolean;
  version: string;
  created_at: string;
  updated_at: string;
};

export type EmbeddingProviderConnectionRecord = {
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
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  embedding_provider_definition?: EmbeddingProviderDefinitionRecord | null;
};

export type KnowledgeEmbeddingRecord = {
  id: string;
  company_id: string;
  knowledge_chunk_id: string;
  connection_id: string;
  provider: string;
  model: string;
  dimensions: number;
  embedding_version: number;
  vector: number[];
  checksum: string;
  status: EmbeddingStatus;
  is_active: boolean;
  metadata: Record<string, unknown>;
  activated_at: string | null;
  superseded_at: string | null;
  created_at: string;
  created_by: string | null;
};

export type EmbeddingJobRecord = {
  id: string;
  company_id: string;
  knowledge_chunk_id: string;
  connection_id: string;
  provider: string;
  model: string;
  embedding_version: number;
  status: EmbeddingJobStatus;
  retry_count: number;
  max_retries: number;
  error_message: string | null;
  result_embedding_id: string | null;
  metadata: Record<string, unknown>;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type KnowledgeChunkSnapshot = {
  id: string;
  company_id: string;
  content: string;
  checksum: string;
};

export type CreateEmbeddingProviderConnectionInput = {
  companyId: string;
  providerId: string;
  displayName: string;
  configuration?: Record<string, unknown>;
  isDefault?: boolean;
  isEnabled?: boolean;
  status?: ProviderConnectionStatus;
  healthStatus?: ProviderHealthStatus;
};

export type UpdateEmbeddingProviderConnectionInput = {
  connectionId: string;
  configuration?: Record<string, unknown>;
  displayName?: string;
  status?: ProviderConnectionStatus;
  isEnabled?: boolean;
  isDefault?: boolean;
};

export type ListEmbeddingProviderConnectionsFilter = {
  companyId: string;
  isEnabled?: boolean;
  healthStatus?: ProviderHealthStatus;
  providerKey?: string;
};

export type CreateKnowledgeEmbeddingInput = {
  companyId: string;
  knowledgeChunkId: string;
  connectionId: string;
  provider: string;
  model: string;
  dimensions: number;
  embeddingVersion: number;
  vector: number[];
  checksum: string;
  status?: EmbeddingStatus;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
};

export type UpdateKnowledgeEmbeddingInput = {
  embeddingId: string;
  status?: EmbeddingStatus;
  isActive?: boolean;
  activatedAt?: string | null;
  supersededAt?: string | null;
};

export type ListKnowledgeEmbeddingsFilter = {
  companyId: string;
  knowledgeChunkId?: string;
  provider?: string;
  model?: string;
  isActive?: boolean;
};

export type CreateEmbeddingJobInput = {
  companyId: string;
  knowledgeChunkId: string;
  connectionId: string;
  provider: string;
  model: string;
  embeddingVersion: number;
  maxRetries?: number;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
};

export type UpdateEmbeddingJobInput = {
  jobId: string;
  status?: EmbeddingJobStatus;
  retryCount?: number;
  errorMessage?: string | null;
  resultEmbeddingId?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
};

export type ListEmbeddingJobsFilter = {
  companyId: string;
  status?: EmbeddingJobStatus;
  knowledgeChunkId?: string;
};

export type ResolveEmbeddingProviderInput = {
  providerKey: string;
  configuration: Record<string, unknown>;
};

export type GenerateEmbeddingInput = {
  text: string;
  model?: string;
  dimensions?: number;
  metadata?: Record<string, unknown>;
};

export type GenerateEmbeddingResult = {
  vector: number[];
  dimensions: number;
  model: string;
  providerKey: string;
  mock?: boolean;
  latencyMs?: number;
  tokenCount?: number;
};

export type GenerateEmbeddingsBatchInput = {
  items: GenerateEmbeddingInput[];
};

export type GenerateEmbeddingsBatchResult = {
  results: GenerateEmbeddingResult[];
  providerKey: string;
  mock?: boolean;
  latencyMs?: number;
};

export type HealthResult = {
  status: "connected" | "disconnected" | "warning" | "error" | "unknown";
  providerKey: string;
  message: string;
  checkedAt: string;
  mock?: boolean;
};

export type ModelsResult = {
  models: Array<{
    id: string;
    displayName: string;
    dimensions: number;
  }>;
  providerKey: string;
  mock?: boolean;
};

export type EmbeddingTelemetryEvent = {
  companyId: string | null;
  providerKey: string;
  model: string;
  operation: "generate" | "generate_batch" | "health";
  status: "succeeded" | "failed";
  latencyMs: number;
  batchSize?: number;
  errorMessage?: string;
  mock?: boolean;
};

export type EnqueueEmbeddingsForVersionInput = {
  companyId: string;
  versionId: string;
  connectionId: string;
  model?: string;
  regenerate?: boolean;
};

export type ProcessEmbeddingBatchOptions = {
  limit?: number;
  batchSize?: number;
};

export type ConfigurationValidationResult = {
  valid: boolean;
  errors: string[];
};

export type EnqueueEmbeddingInput = {
  companyId: string;
  knowledgeChunkId: string;
  connectionId: string;
  model?: string;
  regenerate?: boolean;
};
