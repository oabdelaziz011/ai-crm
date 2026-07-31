import { AgentKnowledgeRetrievalError } from "../errors.js";
import type { AgentRetrievalPolicy, AgentTaskGraph, ServiceContext } from "../types.js";
import {
  AgentKnowledgeContextBuilder,
  buildKnowledgeToolOutput,
} from "./agent-knowledge-context-builder.js";
import { inferRetrievalQuery, resolveRetrievalPolicy } from "./retrieval-policy.js";
import { assertKnowledgeRetrievalPermissions } from "./knowledge-retrieval-permissions.js";
import type {
  AgentKnowledgeRetrievalInput,
  AgentKnowledgeRetrievalResult,
  AgentKnowledgeRetrievalStatus,
  KnowledgeRetrievalPort,
} from "./retrieval-types.js";

function emptyRetrievalResult(): AgentKnowledgeRetrievalResult {
  return {
    contextText: "",
    citations: [],
    chunks: [],
    confidence: 0,
    chunkCount: 0,
    totalTokens: 0,
    searchMode: "hybrid",
    executionId: null,
    vectorQueryExecutionId: null,
  };
}

function assertTenantAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new Error("Tenant isolation violation: company access denied.");
  }
}

export class AgentKnowledgeRetrievalService {
  private readonly contextBuilder = new AgentKnowledgeContextBuilder();

  async retrieveForWorkflow(
    ctx: ServiceContext,
    input: {
      companyId: string;
      goal: string;
      taskGraph: AgentTaskGraph;
      pageContext?: Record<string, unknown>;
      conversationHistory?: string[];
      policy?: AgentRetrievalPolicy;
      metadataFilters?: Record<string, unknown>;
      sourceIds?: string[];
      documentIds?: string[];
    },
    port: KnowledgeRetrievalPort,
    options?: {
      resolveRequiredPermissions?: (toolKey: string) => Promise<string[] | null | undefined>;
    },
  ): Promise<{
    status: AgentKnowledgeRetrievalStatus;
    executionContext: ReturnType<AgentKnowledgeContextBuilder["build"]>;
  }> {
    const policy = input.policy ?? resolveRetrievalPolicy(input.taskGraph);
    assertTenantAccess(ctx, input.companyId);

    if (policy === "disabled") {
      return {
        status: { status: "skipped" },
        executionContext: this.contextBuilder.build({
          goal: input.goal,
          conversationHistory: input.conversationHistory,
        }),
      };
    }

    await assertKnowledgeRetrievalPermissions(ctx, {
      resolveRequiredPermissions: options?.resolveRequiredPermissions,
    });

    const question = inferRetrievalQuery(input.goal, input.pageContext);
    const retrievalInput: AgentKnowledgeRetrievalInput = {
      companyId: input.companyId,
      question,
      searchMode: "hybrid",
      metadataFilters: input.metadataFilters ?? extractMetadataFilters(input.pageContext),
      sourceIds: input.sourceIds,
      documentIds: input.documentIds,
      rerank: true,
    };

    try {
      const result = await port.retrieve(ctx, retrievalInput);
      const executionContext = this.contextBuilder.build({
        goal: input.goal,
        retrieval: result,
        conversationHistory: input.conversationHistory,
      });

      const status: AgentKnowledgeRetrievalStatus =
        result.chunkCount > 0
          ? { status: "success", result }
          : { status: "empty", result };

      if (policy === "required" && result.chunkCount === 0) {
        throw new AgentKnowledgeRetrievalError(
          "KNOWLEDGE_RETRIEVAL_EMPTY",
          "Required knowledge retrieval returned no results.",
        );
      }

      return { status, executionContext };
    } catch (error) {
      if (error instanceof AgentKnowledgeRetrievalError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      if (policy === "required") {
        throw new AgentKnowledgeRetrievalError(
          "KNOWLEDGE_RETRIEVAL_FAILED",
          `Required knowledge retrieval failed: ${message}`,
        );
      }

      return {
        status: { status: "failed", error: message, policy },
        executionContext: this.contextBuilder.build({
          goal: input.goal,
          retrieval: emptyRetrievalResult(),
          conversationHistory: input.conversationHistory,
        }),
      };
    }
  }

  async retrieveForTask(
    ctx: ServiceContext,
    input: AgentKnowledgeRetrievalInput,
    port: KnowledgeRetrievalPort,
    options?: {
      resolveRequiredPermissions?: (toolKey: string) => Promise<string[] | null | undefined>;
    },
  ): Promise<Record<string, unknown>> {
    assertTenantAccess(ctx, input.companyId);
    await assertKnowledgeRetrievalPermissions(ctx, {
      resolveRequiredPermissions: options?.resolveRequiredPermissions,
    });
    const result = await port.retrieve(ctx, input);
    return buildKnowledgeToolOutput(result);
  }
}

function extractMetadataFilters(pageContext?: Record<string, unknown>): Record<string, unknown> | undefined {
  const filters = pageContext?.knowledgeMetadataFilters;
  if (filters && typeof filters === "object" && !Array.isArray(filters)) {
    return filters as Record<string, unknown>;
  }
  return undefined;
}

export function normalizePortRetrievalResult(raw: {
  contextText?: string;
  citations?: Array<Record<string, unknown>>;
  chunks?: Array<Record<string, unknown>>;
  confidence?: number;
  chunkCount?: number;
  totalTokens?: number;
  searchMode?: "vector" | "keyword" | "hybrid";
  executionId?: string;
  vectorQueryExecutionId?: string | null;
}): AgentKnowledgeRetrievalResult {
  const citations = (raw.citations ?? []).map((item, index) => ({
    citationId: String(item.citationId ?? item.id ?? `cite-${index + 1}`),
    sourceId: String(item.sourceId ?? item.documentId ?? item.source ?? "unknown"),
    title: String(item.documentTitle ?? item.title ?? "Document"),
    chunkId: String(item.chunkId ?? item.id ?? `chunk-${index + 1}`),
    confidence: typeof item.confidence === "number" ? item.confidence : 0,
    score: typeof item.score === "number" ? item.score : null,
    excerpt: String(item.excerpt ?? item.content ?? "").slice(0, 500),
    sectionTitle: typeof item.sectionTitle === "string" ? item.sectionTitle : null,
  }));

  const chunks = (raw.chunks ?? []).map((item, index) => ({
    id: String(item.id ?? item.chunkId ?? `chunk-${index + 1}`),
    content: String(item.content ?? item.chunkText ?? ""),
    title: String(item.documentTitle ?? item.title ?? "Document"),
    sourceId: String(item.sourceId ?? item.documentId ?? "unknown"),
    chunkId: String(item.chunkId ?? item.id ?? `chunk-${index + 1}`),
    confidence: typeof item.confidence === "number" ? item.confidence : 0,
    score: typeof item.score === "number" ? item.score : null,
    tokenCount: typeof item.tokenCount === "number" ? item.tokenCount : 0,
  }));

  return {
    contextText: raw.contextText ?? "",
    citations,
    chunks,
    confidence: raw.confidence ?? 0,
    chunkCount: raw.chunkCount ?? chunks.length,
    totalTokens: raw.totalTokens ?? 0,
    searchMode: raw.searchMode ?? "hybrid",
    executionId: raw.executionId ?? null,
    vectorQueryExecutionId: raw.vectorQueryExecutionId ?? null,
  };
}
