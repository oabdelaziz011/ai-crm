import type { KnowledgeAccessContext } from "../coordinator/knowledge-search-coordinator.js";
import type { KnowledgeContextDto } from "../dto/knowledge-context-dto.js";
import type { KnowledgeRuntimeProvider } from "../provider/knowledge-runtime-provider.js";

/** Company-scoped retrieval IDs — resolved from trusted tenant config, never from the LLM. */
export type CrmRagRetrievalConfig = {
  embeddingConnectionId: string;
  vectorStoreConnectionId: string;
  collectionId: string;
};

export type CrmRagKnowledgeToolResult = {
  results: Array<{ title: string; excerpt: string; confidence: number }>;
  contextText: string;
};

export type CrmRagKnowledgeRetriever = (input: {
  companyId: string;
  userId: string;
  query: string;
}) => Promise<CrmRagKnowledgeToolResult>;

export type CreateCrmRagKnowledgeRetrieverOptions = {
  knowledgeRuntime: Pick<KnowledgeRuntimeProvider, "retrieveForTool">;
  resolveRetrievalConfig: (companyId: string) => Promise<CrmRagRetrievalConfig | null>;
  buildAccessContext?: (input: { companyId: string; userId: string }) => KnowledgeAccessContext;
};

export const KNOWLEDGE_RETRIEVAL_NOT_CONFIGURED_MESSAGE =
  "Knowledge retrieval is not configured for this company. Configure an embedding connection, vector store connection, and an active collection.";

export const KNOWLEDGE_RETRIEVAL_FAILED_MESSAGE =
  "Knowledge retrieval failed. Please try again later.";

const TOOL_RETRIEVAL_PERMISSIONS = new Set([
  "knowledge.view",
  "retrieval.view",
  "retrieval.execute",
]);

/**
 * Maps KnowledgeRuntimeProvider RAG output into the CRM `knowledge_search` tool contract.
 * Company scope and connection IDs come only from trusted input + resolveRetrievalConfig.
 */
export function createCrmRagKnowledgeRetriever(
  options: CreateCrmRagKnowledgeRetrieverOptions,
): CrmRagKnowledgeRetriever {
  return async (input) => {
    const companyId = typeof input.companyId === "string" ? input.companyId.trim() : "";
    if (!companyId) {
      return {
        results: [],
        contextText: "Company context is required for knowledge retrieval.",
      };
    }

    const userId = typeof input.userId === "string" ? input.userId.trim() : "";
    if (!userId) {
      return {
        results: [],
        contextText: "Authentication is required for knowledge retrieval.",
      };
    }

    const query = typeof input.query === "string" ? input.query.trim() : "";
    if (!query) {
      return {
        results: [],
        contextText: "A search query is required.",
      };
    }

    let config: CrmRagRetrievalConfig | null;
    try {
      config = await options.resolveRetrievalConfig(companyId);
    } catch (error) {
      return {
        results: [],
        contextText: `${KNOWLEDGE_RETRIEVAL_FAILED_MESSAGE} (${formatError(error)})`,
      };
    }

    if (
      !config?.embeddingConnectionId?.trim() ||
      !config.vectorStoreConnectionId?.trim() ||
      !config.collectionId?.trim()
    ) {
      return {
        results: [],
        contextText: KNOWLEDGE_RETRIEVAL_NOT_CONFIGURED_MESSAGE,
      };
    }

    const access =
      options.buildAccessContext?.({ companyId, userId }) ??
      createDefaultToolRetrievalAccessContext({ companyId, userId });

    if (!access.companyId || access.companyId !== companyId) {
      return {
        results: [],
        contextText: "Company context is required for knowledge retrieval.",
      };
    }

    try {
      const context = await options.knowledgeRuntime.retrieveForTool(access, {
        companyId,
        question: query,
        embeddingConnectionId: config.embeddingConnectionId,
        vectorStoreConnectionId: config.vectorStoreConnectionId,
        collectionId: config.collectionId,
        searchMode: "hybrid",
        rerank: true,
      });
      return mapKnowledgeContextToToolResult(context);
    } catch (error) {
      return {
        results: [],
        contextText: `${KNOWLEDGE_RETRIEVAL_FAILED_MESSAGE} (${formatError(error)})`,
      };
    }
  };
}

/** Non-admin, company-scoped context sufficient for KnowledgeSearchCoordinator + orchestration. */
export function createDefaultToolRetrievalAccessContext(input: {
  companyId: string;
  userId: string;
}): KnowledgeAccessContext {
  const companyId = input.companyId.trim();
  const userId = input.userId.trim();
  return {
    userId,
    companyId,
    actorUserId: userId,
    isSuperAdmin: false,
    hasPermission(permissionCode: string): boolean {
      if (!companyId || !userId) return false;
      return TOOL_RETRIEVAL_PERMISSIONS.has(permissionCode.trim());
    },
  };
}

export function mapKnowledgeContextToToolResult(context: KnowledgeContextDto): CrmRagKnowledgeToolResult {
  const results = context.chunks.map((chunk, index) => ({
    title: chunk.documentTitle || chunk.articleTitle || `Document ${index + 1}`,
    excerpt: (chunk.chunkText || chunk.citation?.excerpt || "").slice(0, 280),
    confidence: chunk.confidence ?? chunk.score ?? context.confidence ?? Math.max(0.1, 1 - index * 0.08),
  }));

  return {
    results,
    contextText:
      context.contextText?.trim() ||
      (results.length > 0
        ? results.map((r, i) => `[${i + 1}] ${r.title}\n${r.excerpt}`).join("\n\n")
        : "No knowledge documents matched this query."),
  };
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "unknown error";
}
