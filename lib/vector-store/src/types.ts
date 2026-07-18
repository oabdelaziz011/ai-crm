import type {
  CollectionStatus,
  IndexedVectorStatus,
  ProviderConnectionStatus,
  ProviderHealthStatus,
  VectorStoreCapability,
} from "./constants.js";

export type JsonSchema = Record<string, unknown>;

export type ServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
};

export type VectorStoreDefinitionRecord = {
  id: string;
  key: string;
  display_name: string;
  description: string;
  icon: string | null;
  supported_capabilities: VectorStoreCapability[];
  configuration_schema: JsonSchema;
  default_configuration: Record<string, unknown>;
  is_active: boolean;
  version: string;
  created_at: string;
  updated_at: string;
};

export type VectorStoreConnectionRecord = {
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
  vector_store_definition?: VectorStoreDefinitionRecord | null;
};

export type VectorCollectionRecord = {
  id: string;
  company_id: string;
  connection_id: string;
  name: string;
  provider: string;
  embedding_version: number;
  status: CollectionStatus;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  created_by: string | null;
};

export type IndexedVectorRecord = {
  id: string;
  company_id: string;
  knowledge_embedding_id: string;
  collection_id: string;
  provider: string;
  external_reference: string;
  status: IndexedVectorStatus;
  metadata: Record<string, unknown>;
  indexed_at: string | null;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type KnowledgeEmbeddingSnapshot = {
  id: string;
  company_id: string;
  knowledge_chunk_id: string;
  provider: string;
  model: string;
  dimensions: number;
  embedding_version: number;
  vector: number[];
  checksum: string;
  is_active: boolean;
  status: string;
};

export type CreateVectorStoreConnectionInput = {
  companyId: string;
  providerId: string;
  displayName: string;
  configuration?: Record<string, unknown>;
  isDefault?: boolean;
  isEnabled?: boolean;
  status?: ProviderConnectionStatus;
  healthStatus?: ProviderHealthStatus;
};

export type UpdateVectorStoreConnectionInput = {
  connectionId: string;
  configuration?: Record<string, unknown>;
  displayName?: string;
  status?: ProviderConnectionStatus;
  isEnabled?: boolean;
  isDefault?: boolean;
  healthStatus?: ProviderHealthStatus;
  lastHealthCheck?: string | null;
};

export type ListVectorStoreConnectionsFilter = {
  companyId: string;
  isEnabled?: boolean;
  healthStatus?: ProviderHealthStatus;
  providerKey?: string;
};

export type CreateVectorCollectionInput = {
  companyId: string;
  connectionId: string;
  name: string;
  provider: string;
  embeddingVersion: number;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
};

export type UpdateVectorCollectionInput = {
  collectionId: string;
  status?: CollectionStatus;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
  embeddingVersion?: number;
};

export type ListVectorCollectionsFilter = {
  companyId: string;
  connectionId?: string;
  isActive?: boolean;
};

export type CreateIndexedVectorInput = {
  companyId: string;
  knowledgeEmbeddingId: string;
  collectionId: string;
  provider: string;
  externalReference: string;
  status?: IndexedVectorStatus;
  metadata?: Record<string, unknown>;
  indexedAt?: string | null;
  createdBy?: string | null;
};

export type UpdateIndexedVectorInput = {
  indexedVectorId: string;
  status?: IndexedVectorStatus;
  externalReference?: string;
  metadata?: Record<string, unknown>;
  indexedAt?: string | null;
  removedAt?: string | null;
};

export type ListIndexedVectorsFilter = {
  companyId: string;
  collectionId?: string;
  knowledgeEmbeddingId?: string;
  status?: IndexedVectorStatus;
};

export type ResolveVectorStoreProviderInput = {
  providerKey: string;
  configuration: Record<string, unknown>;
};

export type ConfigurationValidationResult = {
  valid: boolean;
  errors: string[];
};

export type CreateCollectionInput = {
  name: string;
  dimensions: number;
  metadata?: Record<string, unknown>;
};

export type CreateCollectionResult = {
  collectionName: string;
  providerKey: string;
  mock?: boolean;
};

export type DeleteCollectionInput = {
  name: string;
};

export type DeleteCollectionResult = {
  collectionName: string;
  deleted: true;
  mock?: boolean;
};

export type UpsertVectorInput = {
  collectionName: string;
  vectorId: string;
  vector: number[];
  metadata?: Record<string, unknown>;
};

export type UpsertVectorResult = {
  collectionName: string;
  vectorId: string;
  externalReference: string;
  mock?: boolean;
};

export type DeleteVectorInput = {
  collectionName: string;
  vectorId: string;
};

export type DeleteVectorResult = {
  collectionName: string;
  vectorId: string;
  deleted: true;
  mock?: boolean;
};

export type CollectionStatisticsInput = {
  collectionName: string;
};

export type CollectionStatisticsResult = {
  collectionName: string;
  vectorCount: number;
  dimensions: number;
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

export type CreateManagedCollectionInput = {
  companyId: string;
  connectionId: string;
  name: string;
  embeddingVersion: number;
  dimensions: number;
  metadata?: Record<string, unknown>;
};

export type IndexEmbeddingInput = {
  companyId: string;
  collectionId: string;
  knowledgeEmbeddingId: string;
};

export type RemoveIndexedVectorInput = {
  companyId: string;
  indexedVectorId: string;
};
