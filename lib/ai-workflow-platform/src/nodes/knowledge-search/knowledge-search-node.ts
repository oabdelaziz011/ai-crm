import { BaseAIWorkflowNode } from "../base-ai-workflow-node.js";
import type { AIWorkflowKnowledgeRetrievalResult } from "../../adapters/knowledge-retrieval-port.js";
import type { AIWorkflowRegistryBundle } from "../../registries/index.js";
import type { AIWorkflowNodeConfig, AIWorkflowNodeDefinition } from "../../types/configuration.js";
import type { AIWorkflowExecutionResult, AIWorkflowNodeOutput, AIWorkflowRuntimeMetadata } from "../../types/metadata.js";
import type { AIWorkflowPreviewResult } from "../../types/preview.js";
import type { AIWorkflowValidationIssue } from "../../types/validation.js";
import type { AIWorkflowAutomationContext } from "../../types/automation-context.js";
import type { AIWorkflowServiceContext } from "../../adapters/ai-workflow-execution-adapter.js";
import type { AIWorkflowObservabilityRecorder } from "../../observability/ai-workflow-observability.js";
import { AI_KNOWLEDGE_SEARCH_NODE_KEY } from "./constants.js";
import { createDefaultKnowledgeSearchNodeConfig, readKnowledgeSearchMetadata } from "./types.js";
import {
  buildKnowledgeRetrievalInput,
  buildKnowledgeSearchPromptContext,
  estimateKnowledgeSearchTokenRange,
  resolveKnowledgeSearchQuery,
} from "./knowledge-search-presets.js";
import { formatKnowledgeSearchOutput, mapKnowledgeSearchResult } from "./result-mapper.js";

export const AI_KNOWLEDGE_SEARCH_NODE_DEFINITION: AIWorkflowNodeDefinition = {
  key: AI_KNOWLEDGE_SEARCH_NODE_KEY,
  displayName: "AI Knowledge Search",
  description: "Search enterprise knowledge and return relevant context.",
  category: "knowledge",
  icon: "BookOpen",
  version: "1.0.0",
  capabilities: ["retrievalOnly", "usesKnowledge", "supportsContext", "supportsJson"],
  outputModes: ["structured", "json", "array", "text"],
  defaultConfig: createDefaultKnowledgeSearchNodeConfig(),
};

export class AIKnowledgeSearchNode extends BaseAIWorkflowNode {
  readonly definition = AI_KNOWLEDGE_SEARCH_NODE_DEFINITION;

  override getDefaultConfig(): AIWorkflowNodeConfig {
    return createDefaultKnowledgeSearchNodeConfig();
  }

  override validateConfig(
    config: AIWorkflowNodeConfig,
    registries: AIWorkflowRegistryBundle,
  ): AIWorkflowValidationIssue[] {
    return registries.validation.validate(config, {
      nodeKey: this.definition.key,
      capabilities: this.definition.capabilities,
      hasProviderResolver: true,
    }).issues;
  }

  override prepareConfig(
    config: AIWorkflowNodeConfig,
    context: { automation: AIWorkflowAutomationContext; serviceContext: AIWorkflowServiceContext },
  ): AIWorkflowNodeConfig {
    const search = readKnowledgeSearchMetadata(config);
    const query = resolveKnowledgeSearchQuery(config, context.automation);
    return {
      ...this.getDefaultConfig(),
      ...config,
      nodeKey: AI_KNOWLEDGE_SEARCH_NODE_KEY,
      outputMode: config.outputMode ?? "structured",
      outputVariable: config.outputVariable ?? this.getDefaultConfig().outputVariable,
      knowledge: {
        ...this.getDefaultConfig().knowledge,
        ...config.knowledge,
        enabled: true,
        maxChunks: search.maxChunks,
        similarityThreshold: search.minimumScore,
      },
      metadata: {
        ...config.metadata,
        knowledgeSearch: search,
        resolvedQueryPreview: query.slice(0, 240),
      },
    };
  }

  override buildPromptContext(
    config: AIWorkflowNodeConfig,
    context: AIWorkflowAutomationContext,
  ): Record<string, unknown> {
    return buildKnowledgeSearchPromptContext(config, context);
  }

  override buildRetrievalQuery(config: AIWorkflowNodeConfig, context: AIWorkflowAutomationContext): string {
    return resolveKnowledgeSearchQuery(config, context);
  }

  override buildKnowledgeRetrievalInput(
    config: AIWorkflowNodeConfig,
    context: AIWorkflowAutomationContext,
    question: string,
  ) {
    return buildKnowledgeRetrievalInput(config, context, question);
  }

  override mapRetrievalResult(
    result: AIWorkflowKnowledgeRetrievalResult,
    config: AIWorkflowNodeConfig,
  ): AIWorkflowNodeOutput {
    const payload = mapKnowledgeSearchResult(result, config);
    return formatKnowledgeSearchOutput(config, payload);
  }

  override enrichRetrievalMetadata(
    metadata: AIWorkflowRuntimeMetadata,
    result: AIWorkflowKnowledgeRetrievalResult,
    output: AIWorkflowNodeOutput,
    config: AIWorkflowNodeConfig,
  ): AIWorkflowRuntimeMetadata {
    const payload = mapKnowledgeSearchResult(result, config);
    return {
      ...metadata,
      knowledgeUsed: true,
      knowledgeChunkCount: result.chunkCount,
      knowledgeSearchExecutionId: result.executionId,
      knowledgeCollectionsUsed: config.knowledge?.collectionId ? [config.knowledge.collectionId] : [],
      knowledgeDocumentsRetrieved: payload.documents.length,
      knowledgeAverageSimilarity: payload.metadata.averageSimilarity,
      knowledgeRetrievalLatencyMs: result.retrievalLatencyMs,
      validationStatus: "valid",
    };
  }

  override onPrepared(
    record: AIWorkflowObservabilityRecorder,
    config: AIWorkflowNodeConfig,
    context: AIWorkflowAutomationContext,
  ): void {
    const search = readKnowledgeSearchMetadata(config);
    record({
      type: "knowledge_search_started",
      nodeKey: config.nodeKey,
      metadata: {
        queryPreview: resolveKnowledgeSearchQuery(config, context).slice(0, 180),
        collectionId: config.knowledge?.collectionId ?? null,
        topK: search.topK,
        minimumScore: search.minimumScore,
      },
    });
  }

  override onRetrievalCompleted(
    record: AIWorkflowObservabilityRecorder,
    result: AIWorkflowKnowledgeRetrievalResult,
    config: AIWorkflowNodeConfig,
  ): void {
    record({
      type: "results_ranked",
      nodeKey: config.nodeKey,
      executionId: result.executionId,
      metadata: {
        chunkCount: result.chunkCount,
        averageSimilarity: mapKnowledgeSearchResult(result, config).metadata.averageSimilarity,
      },
    });
    record({
      type: "knowledge_search_completed",
      nodeKey: config.nodeKey,
      executionId: result.executionId,
      metadata: {
        documentsRetrieved: mapKnowledgeSearchResult(result, config).documents.length,
        chunksRetrieved: result.chunkCount,
      },
    });
  }

  override buildPreview(
    config: AIWorkflowNodeConfig,
    registries: AIWorkflowRegistryBundle,
    workflowVariables: Record<string, unknown> = {},
  ): AIWorkflowPreviewResult {
    const base = super.buildPreview(config, registries, workflowVariables);
    const search = readKnowledgeSearchMetadata(config);
    const query = resolveKnowledgeSearchQuery(config, {
      company: { id: "preview" },
      flow: { id: "preview" },
      run: { id: "preview" },
      session: { id: "preview" },
      variables: workflowVariables,
      customer: { id: null },
      currentNode: { config: {} },
    });

    return {
      ...base,
      expectedOutput: "Ranked knowledge chunks with document metadata",
      estimatedTokenRange: estimateKnowledgeSearchTokenRange(query, search.topK),
      knowledgeEnabled: true,
      knowledgeSummary: config.knowledge?.collectionId
        ? `Collection ${config.knowledge.collectionId} · top ${search.topK} · min score ${search.minimumScore}`
        : "Select a knowledge collection",
      nodeMetadata: {
        queryPreview: query.slice(0, 180) || null,
        collectionId: config.knowledge?.collectionId ?? null,
        topK: search.topK,
        minimumScore: search.minimumScore,
        estimatedRetrievalCount: search.topK,
        expectedOutput: {
          summary: "...",
          documents: [],
          chunks: [],
          sources: [],
          metadata: {},
        },
      },
    };
  }

  override mapResult(_result: AIWorkflowExecutionResult, config: AIWorkflowNodeConfig): AIWorkflowNodeOutput {
    return formatKnowledgeSearchOutput(config, {
      summary: "",
      documents: [],
      chunks: [],
      sources: [],
      metadata: {
        executionId: "",
        vectorQueryExecutionId: "",
        chunkCount: 0,
        totalTokens: 0,
        averageSimilarity: null,
        retrievalLatencyMs: 0,
        rankingLatencyMs: 0,
        policyId: null,
        collectionId: config.knowledge?.collectionId ?? null,
      },
    });
  }
}

export function createAIKnowledgeSearchNode(): AIKnowledgeSearchNode {
  return new AIKnowledgeSearchNode();
}
