import type { SupabaseClient } from "@supabase/supabase-js";
import { ContextAssemblyEngine } from "./engines/context-assembly-engine.js";
import { ContextBudgetEngine } from "./engines/context-budget-engine.js";
import { ContextSelectionEngine } from "./engines/context-selection-engine.js";
import { RetrievalEngine } from "./engines/retrieval-engine.js";
import { RetrievalMetricsEngine } from "./engines/retrieval-metrics-engine.js";
import { RetrievalOrchestrationEngine } from "./engines/retrieval-orchestration-engine.js";
import { RetrievalPolicyEngine } from "./engines/retrieval-policy-engine.js";
import {
  NoopQueryEmbeddingPort,
  type QueryEmbeddingPort,
} from "./ports/query-embedding-port.js";
import { NoopRetrievalTelemetryPort, type RetrievalTelemetryPort } from "./ports/observability-port.js";
import {
  NoopVectorQueryExecutionPort,
  type VectorQueryExecutionPort,
} from "./ports/vector-query-execution-port.js";
import {
  createDefaultKnowledgePolicyRegistry,
  createDefaultKnowledgeRankingRegistry,
  KnowledgeProvider,
} from "./providers/knowledge-provider.js";
import { KnowledgeObservability } from "./observability/knowledge-observability.js";
import {
  createSupabaseKnowledgeHydrationReadRepository,
  createSupabaseRetrievalContextRepository,
  createSupabaseRetrievalExecutionRepository,
  createSupabaseRetrievalMetricsRepository,
  createSupabaseRetrievalPolicyRepository,
  createSupabaseVectorQueryReadRepository,
} from "./repositories/supabase-retrieval-repositories.js";

export type RetrievalServicesOptions = {
  telemetry?: RetrievalTelemetryPort;
  queryEmbeddingPort?: QueryEmbeddingPort;
  vectorQueryPort?: VectorQueryExecutionPort;
};

export type RetrievalServices = {
  policy: RetrievalPolicyEngine;
  selection: ContextSelectionEngine;
  budget: ContextBudgetEngine;
  assembly: ContextAssemblyEngine;
  metrics: RetrievalMetricsEngine;
  retrieval: RetrievalEngine;
  orchestration: RetrievalOrchestrationEngine;
  knowledge: KnowledgeProvider;
  knowledgePolicies: ReturnType<typeof createDefaultKnowledgePolicyRegistry>;
  knowledgeObservability: KnowledgeObservability;
};

export function createRetrievalServices(
  client: SupabaseClient,
  options?: RetrievalServicesOptions,
): RetrievalServices {
  const policyRepository = createSupabaseRetrievalPolicyRepository(client);
  const executionRepository = createSupabaseRetrievalExecutionRepository(client);
  const contextRepository = createSupabaseRetrievalContextRepository(client);
  const metricsRepository = createSupabaseRetrievalMetricsRepository(client);
  const vectorQueryReader = createSupabaseVectorQueryReadRepository(client);
  const hydrationReader = createSupabaseKnowledgeHydrationReadRepository(client);
  const telemetry = options?.telemetry ?? new NoopRetrievalTelemetryPort();

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
    telemetry,
  );

  const queryEmbeddingPort = options?.queryEmbeddingPort ?? new NoopQueryEmbeddingPort();
  const vectorQueryPort = options?.vectorQueryPort ?? new NoopVectorQueryExecutionPort();
  const orchestration = new RetrievalOrchestrationEngine(queryEmbeddingPort, vectorQueryPort, retrieval);
  const knowledgePolicies = createDefaultKnowledgePolicyRegistry();
  const knowledgeRanking = createDefaultKnowledgeRankingRegistry();
  const knowledgeObservability = new KnowledgeObservability();
  const knowledge = new KnowledgeProvider({
    orchestration,
    policies: knowledgePolicies,
    ranking: knowledgeRanking,
  });

  return {
    policy,
    selection,
    budget,
    assembly,
    metrics,
    retrieval,
    orchestration,
    knowledge,
    knowledgePolicies,
    knowledgeObservability,
  };
}

export * from "./constants.js";
export * from "./dto/retrieval-dto.js";
export * from "./errors.js";
export * from "./types.js";
export * from "./utils/retrieval-utils.js";
export * from "./utils/retrieval-logger.js";
export * from "./ports/observability-port.js";
export * from "./ports/query-embedding-port.js";
export * from "./ports/vector-query-execution-port.js";
export * from "./repositories/retrieval-repositories.js";
export * from "./repositories/supabase-retrieval-repositories.js";
export * from "./engines/retrieval-policy-engine.js";
export * from "./engines/context-selection-engine.js";
export * from "./engines/context-budget-engine.js";
export * from "./engines/context-assembly-engine.js";
export * from "./engines/retrieval-metrics-engine.js";
export * from "./engines/retrieval-engine.js";
export * from "./engines/retrieval-orchestration-engine.js";
export * from "./providers/knowledge-provider.js";
export * from "./observability/knowledge-observability.js";
