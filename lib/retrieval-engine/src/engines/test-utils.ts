import type { RetrievalTelemetryPort } from "../ports/observability-port.js";
import type {
  KnowledgeHydrationReadRepository,
  RetrievalContextRepository,
  RetrievalExecutionRepository,
  RetrievalMetricsRepository,
  RetrievalPolicyRepository,
  VectorQueryReadRepository,
} from "../repositories/retrieval-repositories.js";
import { ContextAssemblyEngine } from "./context-assembly-engine.js";
import { ContextBudgetEngine } from "./context-budget-engine.js";
import { ContextSelectionEngine } from "./context-selection-engine.js";
import { RetrievalEngine } from "./retrieval-engine.js";
import { RetrievalMetricsEngine } from "./retrieval-metrics-engine.js";
import { RetrievalPolicyEngine } from "./retrieval-policy-engine.js";
import type {
  KnowledgeChunkSnapshot,
  KnowledgeDocumentSnapshot,
  KnowledgeSourceSnapshot,
  RetrievalContextChunkRecord,
  RetrievalContextRecord,
  RetrievalExecutionRecord,
  RetrievalMetricsRecord,
  RetrievalPolicyRecord,
  ServiceContext,
  VectorQueryExecutionSnapshot,
  VectorQueryResultSnapshot,
} from "../types.js";

export function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) => ["retrieval.view", "retrieval.execute", "retrieval.manage"].includes(code),
    ...overrides,
  };
}

export function createTestEnvironment() {
  const policies: RetrievalPolicyRecord[] = [
    {
      id: "policy-1",
      company_id: "company-1",
      policy_name: "default",
      max_context_tokens: 500,
      max_chunks: 3,
      window_expansion: 0,
      min_source_diversity: 1,
      overlap_removal_threshold: 0.85,
      default_language: "en",
      source_priority: { policy: 2 },
      department_priority: { legal: 1 },
      chunk_selection_strategy: "score_first",
      metadata: {},
      is_default: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const executions: RetrievalExecutionRecord[] = [];
  const contexts: RetrievalContextRecord[] = [];
  const contextChunks: RetrievalContextChunkRecord[] = [];
  const metricsRecords: RetrievalMetricsRecord[] = [];
  const telemetryEvents: Array<Record<string, unknown>> = [];

  const vectorExecution: VectorQueryExecutionSnapshot = {
    id: "vq-exec-1",
    companyId: "company-1",
    collectionId: "collection-1",
    executionStatus: "completed",
    resultCount: 2,
  };

  const vectorResults: VectorQueryResultSnapshot[] = [
    {
      id: "result-1",
      indexedVectorId: "indexed-1",
      normalizedScore: 0.92,
      ranking: 1,
      metadata: { document_type: "policy" },
    },
    {
      id: "result-2",
      indexedVectorId: "indexed-2",
      normalizedScore: 0.61,
      ranking: 2,
      metadata: { document_type: "faq" },
    },
  ];

  const chunks = new Map<string, KnowledgeChunkSnapshot>([
    [
      "chunk-1",
      {
        id: "chunk-1",
        companyId: "company-1",
        documentId: "doc-1",
        versionId: "version-1",
        sectionId: "section-1",
        chunkIndex: 0,
        chunkOrder: 1,
        content: "Enterprise security policy requires MFA for all users.",
        tokenCount: 12,
        metadata: { department: "legal" },
      },
    ],
    [
      "chunk-2",
      {
        id: "chunk-2",
        companyId: "company-1",
        documentId: "doc-2",
        versionId: "version-2",
        sectionId: "section-2",
        chunkIndex: 0,
        chunkOrder: 1,
        content: "Password reset instructions are available in the help center.",
        tokenCount: 10,
        metadata: { department: "support" },
      },
    ],
  ]);

  const documents = new Map<string, KnowledgeDocumentSnapshot>([
    [
      "doc-1",
      {
        id: "doc-1",
        companyId: "company-1",
        sourceId: "source-1",
        title: "Security Policy",
        language: "en",
        metadata: { department: "legal" },
      },
    ],
    [
      "doc-2",
      {
        id: "doc-2",
        companyId: "company-1",
        sourceId: "source-2",
        title: "Help FAQ",
        language: "en",
        metadata: { department: "support" },
      },
    ],
  ]);

  const sources = new Map<string, KnowledgeSourceSnapshot>([
    ["source-1", { id: "source-1", companyId: "company-1", key: "policy", sourceType: "policy", displayName: "Policy" }],
    ["source-2", { id: "source-2", companyId: "company-1", key: "faq", sourceType: "faq", displayName: "FAQ" }],
  ]);

  const indexedToChunk = new Map<string, string>([
    ["indexed-1", "chunk-1"],
    ["indexed-2", "chunk-2"],
  ]);

  const policyRepository: RetrievalPolicyRepository = {
    findByCompany: async (companyId) =>
      policies.filter((item) => item.company_id === companyId && item.metadata.archived !== true),
    create: async (input) => {
      const record: RetrievalPolicyRecord = {
        id: `policy-${policies.length + 1}`,
        company_id: input.companyId,
        policy_name: input.policyName,
        max_context_tokens: input.maxContextTokens ?? 4096,
        max_chunks: input.maxChunks ?? 20,
        window_expansion: input.windowExpansion ?? 0,
        min_source_diversity: input.minSourceDiversity ?? 1,
        overlap_removal_threshold: input.overlapRemovalThreshold ?? 0.85,
        default_language: input.defaultLanguage ?? null,
        source_priority: input.sourcePriority ?? {},
        department_priority: input.departmentPriority ?? {},
        chunk_selection_strategy: input.chunkSelectionStrategy ?? "score_first",
        metadata: input.metadata ?? {},
        is_default: input.isDefault ?? false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      policies.push(record);
      return record;
    },
    update: async (input) => {
      const record = policies.find((item) => item.id === input.policyId)!;
      Object.assign(record, {
        policy_name: input.policyName ?? record.policy_name,
        max_context_tokens: input.maxContextTokens ?? record.max_context_tokens,
        max_chunks: input.maxChunks ?? record.max_chunks,
        window_expansion: input.windowExpansion ?? record.window_expansion,
        min_source_diversity: input.minSourceDiversity ?? record.min_source_diversity,
        overlap_removal_threshold: input.overlapRemovalThreshold ?? record.overlap_removal_threshold,
        default_language: input.defaultLanguage ?? record.default_language,
        source_priority: input.sourcePriority ?? record.source_priority,
        department_priority: input.departmentPriority ?? record.department_priority,
        chunk_selection_strategy: input.chunkSelectionStrategy ?? record.chunk_selection_strategy,
        metadata: input.metadata ?? record.metadata,
        is_default: input.isDefault ?? record.is_default,
      });
      return record;
    },
    archive: async (policyId) => {
      const record = policies.find((item) => item.id === policyId)!;
      record.metadata = { ...record.metadata, archived: true };
      return record;
    },
    findById: async (id) => policies.find((item) => item.id === id) ?? null,
    findDefault: async (companyId) =>
      policies.find((item) => item.company_id === companyId && item.is_default) ?? null,
  };

  const executionRepository: RetrievalExecutionRepository = {
    createExecution: async (input) => {
      const record: RetrievalExecutionRecord = {
        id: `exec-${executions.length + 1}`,
        company_id: input.companyId,
        vector_query_execution_id: input.vectorQueryExecutionId,
        policy_id: input.policyId ?? null,
        execution_status: "running",
        execution_time_ms: null,
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

  const contextRepository: RetrievalContextRepository = {
    createContext: async (input) => {
      const record: RetrievalContextRecord = {
        id: `context-${contexts.length + 1}`,
        company_id: input.companyId,
        execution_id: input.executionId,
        context_checksum: input.contextChecksum,
        chunk_count: input.chunkCount,
        total_tokens: input.totalTokens,
        metadata: input.metadata ?? {},
        deleted_at: null,
        deleted_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      contexts.push(record);
      return record;
    },
    saveContextChunks: async (inputs) => {
      const saved: RetrievalContextChunkRecord[] = [];
      for (const input of inputs) {
        const record: RetrievalContextChunkRecord = {
          id: `context-chunk-${contextChunks.length + 1}`,
          context_id: input.contextId,
          knowledge_chunk_id: input.knowledgeChunkId,
          indexed_vector_id: input.indexedVectorId ?? null,
          selection_rank: input.selectionRank,
          normalized_score: input.normalizedScore ?? null,
          token_count: input.tokenCount,
          content: input.content,
          metadata: input.metadata ?? {},
          created_at: new Date().toISOString(),
        };
        contextChunks.push(record);
        saved.push(record);
      }
      return saved;
    },
    findContext: async (id) => contexts.find((item) => item.id === id) ?? null,
    listContextChunks: async (contextId) =>
      contextChunks.filter((item) => item.context_id === contextId).sort((a, b) => a.selection_rank - b.selection_rank),
    findContextByExecution: async (executionId) =>
      contexts.find((item) => item.execution_id === executionId && item.deleted_at == null) ?? null,
  };

  const metricsRepository: RetrievalMetricsRepository = {
    saveMetrics: async (input) => {
      const record: RetrievalMetricsRecord = {
        id: `metrics-${metricsRecords.length + 1}`,
        company_id: input.companyId,
        execution_id: input.executionId,
        policy_id: input.policyId ?? null,
        duration_ms: input.durationMs,
        chunks_selected: input.chunksSelected,
        chunks_rejected: input.chunksRejected,
        chunks_discarded_budget: input.chunksDiscardedBudget,
        budget_tokens: input.budgetTokens,
        budget_used_tokens: input.budgetUsedTokens,
        metadata: input.metadata ?? {},
        created_at: new Date().toISOString(),
      };
      metricsRecords.push(record);
      return record;
    },
    findByExecution: async (executionId) =>
      metricsRecords.find((item) => item.execution_id === executionId) ?? null,
  };

  const vectorQueryReader: VectorQueryReadRepository = {
    findExecution: async (id) => (id === vectorExecution.id ? vectorExecution : null),
    listResults: async (executionId) => (executionId === vectorExecution.id ? vectorResults : []),
  };

  const hydrationReader: KnowledgeHydrationReadRepository = {
    resolveChunkFromIndexedVector: async (indexedVectorId) => {
      const chunkId = indexedToChunk.get(indexedVectorId);
      return chunkId ? (chunks.get(chunkId) ?? null) : null;
    },
    resolveDocument: async (documentId) => documents.get(documentId) ?? null,
    resolveSource: async (sourceId) => sources.get(sourceId) ?? null,
    listAdjacentChunks: async () => [],
  };

  const telemetryPort: RetrievalTelemetryPort = {
    recordExecution: async (event) => {
      telemetryEvents.push(event as unknown as Record<string, unknown>);
    },
  };

  const policy = new RetrievalPolicyEngine(policyRepository);
  const selection = new ContextSelectionEngine(vectorQueryReader, hydrationReader);
  const budget = new ContextBudgetEngine();
  const assembly = new ContextAssemblyEngine();
  const metrics = new RetrievalMetricsEngine();
  const retrieval = new RetrievalEngine(
    policy,
    selection,
    budget,
    assembly,
    metrics,
    executionRepository,
    contextRepository,
    metricsRepository,
    vectorQueryReader,
    telemetryPort,
  );

  return {
    policies,
    executions,
    contexts,
    contextChunks,
    metricsRecords,
    telemetryEvents,
    policy,
    selection,
    budget,
    assembly,
    metrics,
    retrieval,
    vectorExecution,
  };
}
