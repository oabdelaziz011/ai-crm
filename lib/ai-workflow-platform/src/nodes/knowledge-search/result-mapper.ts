import type { AIWorkflowKnowledgeRetrievalResult } from "../../adapters/knowledge-retrieval-port.js";
import type { AIWorkflowNodeConfig } from "../../types/configuration.js";
import type { AIWorkflowNodeOutput } from "../../types/metadata.js";
import { readKnowledgeSearchMetadata } from "./types.js";

export type KnowledgeSearchResultPayload = {
  summary: string;
  documents: Array<{
    id: string;
    title: string | null;
    source: string | null;
    collection: string | null;
    tags: string[];
    metadata: Record<string, unknown>;
  }>;
  chunks: Array<{
    id: string;
    content: string;
    score: number | null;
    rank: number;
    documentTitle?: string | null;
    metadata?: Record<string, unknown>;
  }>;
  sources: string[];
  metadata: {
    executionId: string;
    vectorQueryExecutionId: string;
    chunkCount: number;
    totalTokens: number;
    averageSimilarity: number | null;
    retrievalLatencyMs: number;
    rankingLatencyMs: number;
    policyId: string | null;
    collectionId: string | null;
  };
};

function averageSimilarity(chunks: AIWorkflowKnowledgeRetrievalResult["chunks"]): number | null {
  const scores = chunks.map((chunk) => chunk.score).filter((score): score is number => typeof score === "number");
  if (!scores.length) return null;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function buildDocuments(
  result: AIWorkflowKnowledgeRetrievalResult,
  collectionId: string | null,
): KnowledgeSearchResultPayload["documents"] {
  const seen = new Map<string, KnowledgeSearchResultPayload["documents"][number]>();
  for (const chunk of result.chunks) {
    const metadata = chunk.metadata ?? {};
    const documentId =
      typeof metadata.documentId === "string"
        ? metadata.documentId
        : typeof metadata.references === "object" &&
            metadata.references &&
            typeof (metadata.references as Record<string, unknown>).documentId === "string"
          ? String((metadata.references as Record<string, unknown>).documentId)
          : chunk.id;
    if (seen.has(documentId)) continue;
    seen.set(documentId, {
      id: documentId,
      title: chunk.documentTitle ?? (typeof metadata.title === "string" ? metadata.title : null),
      source:
        typeof metadata.sourceId === "string"
          ? metadata.sourceId
          : typeof metadata.source === "string"
            ? metadata.source
            : null,
      collection: collectionId,
      tags: Array.isArray(metadata.tags) ? metadata.tags.map(String) : [],
      metadata,
    });
  }
  return [...seen.values()];
}

export function mapKnowledgeSearchResult(
  result: AIWorkflowKnowledgeRetrievalResult,
  config: AIWorkflowNodeConfig,
): KnowledgeSearchResultPayload {
  const search = readKnowledgeSearchMetadata(config);
  const collectionId = config.knowledge?.collectionId ?? null;
  const documents = buildDocuments(result, collectionId);
  const chunks = result.chunks.slice(0, search.maxChunks).map((chunk) => ({
    id: chunk.id,
    content: chunk.content,
    score: chunk.score,
    rank: chunk.rank,
    documentTitle: chunk.documentTitle ?? null,
    metadata: chunk.metadata ?? {},
  }));
  const sources = [...new Set(documents.map((doc) => doc.source).filter((source): source is string => Boolean(source)))];

  return {
    summary: search.includeContextText ? result.contextText : "",
    documents: search.includeMetadata ? documents : documents.map((doc) => ({ ...doc, metadata: {} })),
    chunks: search.includeChunks ? chunks : [],
    sources,
    metadata: {
      executionId: result.executionId,
      vectorQueryExecutionId: result.vectorQueryExecutionId,
      chunkCount: result.chunkCount,
      totalTokens: result.totalTokens,
      averageSimilarity: averageSimilarity(result.chunks),
      retrievalLatencyMs: result.retrievalLatencyMs,
      rankingLatencyMs: result.rankingLatencyMs,
      policyId: result.policyId,
      collectionId,
    },
  };
}

export function formatKnowledgeSearchOutput(
  config: AIWorkflowNodeConfig,
  payload: KnowledgeSearchResultPayload,
): AIWorkflowNodeOutput {
  if (config.outputMode === "text") {
    return { mode: "text", text: payload.summary || payload.chunks.map((chunk) => chunk.content).join("\n\n") };
  }
  if (config.outputMode === "array") {
    return { mode: "array", value: payload.chunks };
  }
  if (config.outputMode === "json") {
    if (!payload.chunks.length && !payload.summary) {
      return { mode: "json", value: payload.metadata as unknown as Record<string, unknown> };
    }
    return { mode: "json", value: payload as unknown as Record<string, unknown> };
  }
  return { mode: "structured", value: payload as unknown as Record<string, unknown> };
}
