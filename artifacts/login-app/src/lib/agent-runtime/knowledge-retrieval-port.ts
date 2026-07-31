import type { KnowledgeQueryResult } from "@workspace/retrieval-engine";
import type {
  AgentKnowledgeRetrievalInput,
  AgentKnowledgeRetrievalResult,
  KnowledgeRetrievalPort,
  ServiceContext,
} from "@workspace/agent-runtime";
import { normalizePortRetrievalResult } from "@workspace/agent-runtime";

type RuntimeKnowledgeConfig = {
  embeddingConnectionId?: string;
  vectorStoreConnectionId?: string;
  collectionId?: string;
};

type RetrievalRequest = AgentKnowledgeRetrievalInput &
  RuntimeKnowledgeConfig & {
    rerank?: boolean;
  };

type CreateAgentKnowledgeRetrievalPortInput = {
  retrieve: (ctx: ServiceContext, input: RetrievalRequest) => Promise<KnowledgeQueryResult>;
  resolveConfig?: (companyId: string) => Promise<RuntimeKnowledgeConfig | null>;
};

export function createAgentKnowledgeRetrievalPort(
  input: CreateAgentKnowledgeRetrievalPortInput,
): KnowledgeRetrievalPort {
  return {
    async retrieve(ctx, request: AgentKnowledgeRetrievalInput): Promise<AgentKnowledgeRetrievalResult> {
      const config = (await input.resolveConfig?.(request.companyId)) ?? {};
      const response = await input.retrieve(ctx, {
        ...request,
        ...config,
        searchMode: request.searchMode ?? "hybrid",
        rerank: request.rerank ?? true,
      });

      return normalizePortRetrievalResult({
        contextText: response.contextText,
        citations: response.citations as unknown as Array<Record<string, unknown>>,
        chunks: response.chunks as unknown as Array<Record<string, unknown>>,
        confidence: response.confidence,
        chunkCount: response.chunkCount,
        totalTokens: response.totalTokens,
        searchMode: response.searchMode,
        executionId: response.executionId,
        vectorQueryExecutionId: response.vectorQueryExecutionId,
      });
    },
  };
}
