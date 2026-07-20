import type { AIWorkflowAutomationContext } from "../../types/automation-context.js";
import type { AIWorkflowNodeConfig } from "../../types/configuration.js";
import type { AIWorkflowKnowledgeRetrievalInput } from "../../adapters/knowledge-retrieval-port.js";
import { readKnowledgeSearchMetadata } from "./types.js";

function stringifyValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function readVariable(context: AIWorkflowAutomationContext, key: string): unknown {
  return context.variables[key];
}

function extractUpstreamText(value: unknown, mode: "decision" | "extract" | "summarizer"): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.mode === "text" && typeof record.text === "string") return record.text;
    if (record.mode === "classification" && typeof record.label === "string") return record.label;
    if (record.mode === "structured" && record.value && typeof record.value === "object") {
      const payload = record.value as Record<string, unknown>;
      if (mode === "decision") {
        if (typeof payload.label === "string") return payload.label;
      }
      if (mode === "extract" && payload.data) return stringifyValue(payload.data);
      if (mode === "summarizer" && typeof payload.summary === "string") return payload.summary;
      return stringifyValue(payload);
    }
    if (record.mode === "json" && record.value) return stringifyValue(record.value);
    if ("text" in record && typeof record.text === "string") return record.text;
    if ("label" in record && typeof record.label === "string") return record.label;
    if ("value" in record) return stringifyValue(record.value);
  }
  return stringifyValue(value);
}

export function resolveKnowledgeSearchQuery(
  config: AIWorkflowNodeConfig,
  context: AIWorkflowAutomationContext,
): string {
  const search = readKnowledgeSearchMetadata(config);
  const knowledge = config.knowledge;

  if (knowledge?.queryTemplate?.trim()) return knowledge.queryTemplate.trim();
  if (search.inputSource === "custom_query") {
    return search.staticQuery?.trim() ?? knowledge?.queryTemplate?.trim() ?? "";
  }
  if (search.inputSource === "static") return search.staticQuery?.trim() ?? "";
  if (search.inputSource === "conversation_message") {
    return stringifyValue(
      context.variables.__lastUserMessage ??
        context.input?.message ??
        context.variables.input ??
        "",
    ).trim();
  }
  if (search.inputSource === "decision_output") {
    const key = search.upstreamVariable?.trim() || "decision_result";
    return extractUpstreamText(readVariable(context, key), "decision").trim();
  }
  if (search.inputSource === "extract_output") {
    const key = search.upstreamVariable?.trim() || "extract_result";
    return extractUpstreamText(readVariable(context, key), "extract").trim();
  }
  if (search.inputSource === "summarizer_output") {
    const key = search.upstreamVariable?.trim() || "summary_result";
    return extractUpstreamText(readVariable(context, key), "summarizer").trim();
  }
  const key = search.inputVariable?.trim() || "input";
  return stringifyValue(readVariable(context, key)).trim();
}

export function buildKnowledgeSearchMetadataFilters(
  config: AIWorkflowNodeConfig,
): Record<string, unknown> {
  const search = readKnowledgeSearchMetadata(config);
  const filters: Record<string, unknown> = {};
  if (search.filters.tags.length) filters.tags = search.filters.tags;
  if (search.filters.categories.length) filters.categories = search.filters.categories;
  if (search.filters.documentTypes.length) filters.documentTypes = search.filters.documentTypes;
  if (search.filters.tenantScope) filters.tenantScope = search.filters.tenantScope;
  if (search.searchMode === "hybrid") filters.searchMode = "hybrid";
  return filters;
}

export function buildKnowledgeRetrievalInput(
  config: AIWorkflowNodeConfig,
  context: AIWorkflowAutomationContext,
  question: string,
): AIWorkflowKnowledgeRetrievalInput {
  const search = readKnowledgeSearchMetadata(config);
  const knowledge = config.knowledge;
  if (!knowledge?.collectionId || !knowledge.embeddingConnectionId || !knowledge.vectorStoreConnectionId) {
    throw new Error("Knowledge search requires collection and retrieval connections.");
  }

  return {
    companyId: context.company.id,
    question,
    collectionId: knowledge.collectionId,
    embeddingConnectionId: knowledge.embeddingConnectionId,
    vectorStoreConnectionId: knowledge.vectorStoreConnectionId,
    topK: search.topK,
    minimumScore: search.minimumScore ?? knowledge.similarityThreshold ?? 0.7,
    maxTokenBudget: config.policies?.maxTokens ?? 2048,
    metadataFilters: buildKnowledgeSearchMetadataFilters(config),
    correlationId: context.run.id,
    policyKey: search.policyKey ?? "default",
  };
}

export function buildKnowledgeSearchPromptContext(
  config: AIWorkflowNodeConfig,
  context: AIWorkflowAutomationContext,
): Record<string, unknown> {
  const search = readKnowledgeSearchMetadata(config);
  const query = resolveKnowledgeSearchQuery(config, context);
  return {
    knowledgeSearch: {
      query,
      inputSource: search.inputSource,
      collectionId: config.knowledge?.collectionId ?? null,
      topK: search.topK,
      minimumScore: search.minimumScore,
      filters: search.filters,
      searchMode: search.searchMode,
    },
  };
}

export function estimateKnowledgeSearchTokenRange(query: string, topK: number): { min: number; max: number } {
  const queryTokens = Math.max(1, Math.ceil(query.length / 4));
  const chunkTokens = Math.max(32, topK * 48);
  return {
    min: queryTokens + Math.ceil(chunkTokens * 0.4),
    max: queryTokens + chunkTokens + 128,
  };
}
