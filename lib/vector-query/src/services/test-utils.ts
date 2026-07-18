import { createDefaultVectorQueryProviderFactory } from "../factory/vector-query-provider-factory.js";
import type { VectorQueryTelemetryPort } from "../ports/observability-port.js";
import type {
  IndexedVectorReadRepository,
  QueryExecutionRepository,
  QueryResultRepository,
  SearchPolicyRepository,
  VectorStoreConnectionReader,
  VectorStoreDefinitionReader,
} from "../repositories/vector-query-repositories.js";
import { VectorQueryExecutionService } from "./vector-query-execution-service.js";
import { VectorQueryManagementService } from "./vector-query-management-service.js";
import { VectorQueryPolicyService } from "./vector-query-policy-service.js";
import { VectorQueryProviderRegistryService } from "./vector-query-provider-registry-service.js";
import { VectorRankingService } from "./vector-ranking-service.js";
import { VectorResultNormalizationService } from "./vector-result-normalization-service.js";
import type {
  IndexedVectorSnapshot,
  KnowledgeEmbeddingSnapshot,
  ServiceContext,
  VectorCollectionSnapshot,
  VectorQueryExecutionRecord,
  VectorQueryResultRecord,
  VectorSearchPolicyRecord,
  VectorStoreConnectionSnapshot,
} from "../types.js";

export function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) =>
      ["vectorquery.view", "vectorquery.execute", "vectorquery.manage"].includes(code),
    ...overrides,
  };
}

export function createTestEnvironment() {
  const policies: VectorSearchPolicyRecord[] = [
    {
      id: "policy-1",
      company_id: "company-1",
      policy_name: "default",
      default_top_k: 2,
      minimum_similarity_score: 0.1,
      maximum_results: 5,
      metadata: {},
      is_default: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const executions: VectorQueryExecutionRecord[] = [];
  const results: VectorQueryResultRecord[] = [];
  const telemetryEvents: Array<Record<string, unknown>> = [];

  const connection: VectorStoreConnectionSnapshot = {
    id: "connection-1",
    company_id: "company-1",
    provider_key: "pinecone",
    configuration: { environment: "us-east-1", indexName: "vaultos-index" },
    is_enabled: true,
  };

  const collection: VectorCollectionSnapshot = {
    id: "collection-1",
    company_id: "company-1",
    connection_id: "connection-1",
    name: "enterprise-knowledge",
    provider: "pgvector",
    embedding_version: 1,
    is_active: true,
  };

  const embeddings = new Map<string, KnowledgeEmbeddingSnapshot>([
    [
      "embedding-1",
      {
        id: "embedding-1",
        company_id: "company-1",
        vector: [0.12, 0.34, 0.56, 0.78],
        is_active: true,
        status: "active",
      },
    ],
  ]);

  const indexedVectors: IndexedVectorSnapshot[] = [
    {
      id: "indexed-1",
      company_id: "company-1",
      collection_id: "collection-1",
      knowledge_embedding_id: "embedding-1",
      provider: "pgvector",
      external_reference: "ref-1",
      status: "indexed",
      metadata: { document_type: "policy", language: "en", company: "company-1" },
    },
    {
      id: "indexed-2",
      company_id: "company-1",
      collection_id: "collection-1",
      knowledge_embedding_id: "embedding-2",
      provider: "pgvector",
      external_reference: "ref-2",
      status: "indexed",
      metadata: { document_type: "faq", language: "en", company: "company-1" },
    },
  ];

  const definitionReader: VectorStoreDefinitionReader = {
    findByKey: async (key) => ({
      key,
      default_configuration: { schema: "public", tablePrefix: "vs_" },
      configuration_schema: {
        type: "object",
        properties: { schema: { type: "string" } },
        required: ["schema"],
      },
      is_active: true,
    }),
  };

  const policyRepository: SearchPolicyRepository = {
    findByCompany: async (companyId) =>
      policies.filter((item) => item.company_id === companyId && item.metadata.archived !== true),
    create: async (input) => {
      const record: VectorSearchPolicyRecord = {
        id: `policy-${policies.length + 1}`,
        company_id: input.companyId,
        policy_name: input.policyName,
        default_top_k: input.defaultTopK ?? 10,
        minimum_similarity_score: input.minimumSimilarityScore ?? 0,
        maximum_results: input.maximumResults ?? 50,
        metadata: input.metadata ?? {},
        is_default: input.isDefault ?? false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      policies.push(record);
      return record;
    },
    findById: async (id) => policies.find((item) => item.id === id) ?? null,
    findDefault: async (companyId) =>
      policies.find((item) => item.company_id === companyId && item.is_default) ?? null,
    update: async (input) => {
      const record = policies.find((item) => item.id === input.policyId)!;
      Object.assign(record, {
        policy_name: input.policyName ?? record.policy_name,
        default_top_k: input.defaultTopK ?? record.default_top_k,
        minimum_similarity_score: input.minimumSimilarityScore ?? record.minimum_similarity_score,
        maximum_results: input.maximumResults ?? record.maximum_results,
        metadata: input.metadata ?? record.metadata,
      });
      return record;
    },
    archive: async (policyId) => {
      const record = policies.find((item) => item.id === policyId)!;
      record.metadata = { ...record.metadata, archived: true };
      return record;
    },
  };

  const executionRepository: QueryExecutionRepository = {
    createExecution: async (input) => {
      const record: VectorQueryExecutionRecord = {
        id: `execution-${executions.length + 1}`,
        company_id: input.companyId,
        vector_store_connection_id: input.vectorStoreConnectionId,
        collection_id: input.collectionId,
        embedding_id: input.embeddingId ?? null,
        policy_id: input.policyId ?? null,
        query_checksum: input.queryChecksum,
        execution_status: "running",
        execution_time_ms: null,
        provider: input.provider,
        result_count: 0,
        correlation_id: input.correlationId ?? null,
        error_message: null,
        metadata: input.metadata ?? {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      executions.push(record);
      return record;
    },
    updateStatus: async (executionId, status) => {
      const record = executions.find((item) => item.id === executionId)!;
      record.execution_status = status;
      return record;
    },
    completeExecution: async (executionId, input) => {
      const record = executions.find((item) => item.id === executionId)!;
      Object.assign(record, {
        execution_status: "completed",
        execution_time_ms: input.executionTimeMs,
        result_count: input.resultCount,
        metadata: input.metadata ?? record.metadata,
      });
      return record;
    },
    failExecution: async (executionId, input) => {
      const record = executions.find((item) => item.id === executionId)!;
      Object.assign(record, {
        execution_status: "failed",
        execution_time_ms: input.executionTimeMs,
        error_message: input.errorMessage,
      });
      return record;
    },
    findExecution: async (id) => executions.find((item) => item.id === id) ?? null,
    findByCompany: async (companyId) => executions.filter((item) => item.company_id === companyId),
  };

  const resultRepository: QueryResultRepository = {
    saveResults: async (inputs) => {
      const saved: VectorQueryResultRecord[] = [];
      for (const input of inputs) {
        const record: VectorQueryResultRecord = {
          id: `result-${results.length + 1}`,
          execution_id: input.executionId,
          indexed_vector_id: input.indexedVectorId,
          normalized_score: input.normalizedScore,
          provider_score: input.providerScore ?? null,
          ranking: input.ranking,
          metadata: input.metadata ?? {},
          created_at: new Date().toISOString(),
        };
        results.push(record);
        saved.push(record);
      }
      return saved;
    },
    removeResults: async (executionId) => {
      for (let index = results.length - 1; index >= 0; index -= 1) {
        if (results[index]?.execution_id === executionId) {
          results.splice(index, 1);
        }
      }
    },
    listExecutionResults: async (executionId) =>
      results.filter((item) => item.execution_id === executionId).sort((a, b) => a.ranking - b.ranking),
  };

  const connectionReader: VectorStoreConnectionReader = {
    findById: async (id) => (id === connection.id ? connection : null),
  };

  const readRepository: IndexedVectorReadRepository = {
    resolveIndexedVector: async (collectionId, knowledgeEmbeddingId) =>
      indexedVectors.find(
        (item) => item.collection_id === collectionId && item.knowledge_embedding_id === knowledgeEmbeddingId,
      ) ?? null,
    resolveCollection: async (id) => (id === collection.id ? collection : null),
    resolveEmbedding: async (id) => embeddings.get(id) ?? null,
  };

  const telemetryPort: VectorQueryTelemetryPort = {
    recordExecution: async (event) => {
      telemetryEvents.push(event as unknown as Record<string, unknown>);
    },
  };

  const factory = createDefaultVectorQueryProviderFactory(definitionReader);
  const providerRegistry = new VectorQueryProviderRegistryService(
    definitionReader,
    connectionReader,
    factory,
  );
  const policiesService = new VectorQueryPolicyService(policyRepository);
  const normalization = new VectorResultNormalizationService(readRepository);
  const ranking = new VectorRankingService();
  const execution = new VectorQueryExecutionService(
    executionRepository,
    resultRepository,
    connectionReader,
    readRepository,
    providerRegistry,
    policiesService,
    normalization,
    ranking,
  );
  const management = new VectorQueryManagementService(
    execution,
    policiesService,
    executionRepository,
    resultRepository,
    telemetryPort,
  );

  return {
    policies,
    executions,
    results,
    telemetryEvents,
    policiesService,
    execution,
    management,
    ranking,
    normalization,
    providerRegistry,
    factory,
    collection,
    connection,
  };
}
