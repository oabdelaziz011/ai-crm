import type { AIOutputMode } from "../constants.js";

export type AIWorkflowRuntimeMetadata = {
  executionId: string;
  executionTimeMs: number;
  gatewayLatencyMs: number;
  providerKey: string;
  model: string;
  promptVersionId: string | null;
  promptBuildId: string | null;
  promptTemplateKey: string | null;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  estimatedCostUsd: number | null;
  knowledgeUsed: boolean;
  knowledgeChunkCount: number;
  streaming: boolean;
  outputMode: AIOutputMode;
  cacheHit: boolean;
  status: "success" | "failed";
  validationStatus?: "valid" | "invalid";
  extractionConfidence?: {
    overall: number;
    fields: Record<string, number>;
    warnings: string[];
    missingValues: string[];
    correctionHints: string[];
  };
  decisionLabel?: string;
  decisionConfidence?: number;
  decisionScore?: number | null;
  decisionRequiresHumanReview?: boolean;
  knowledgeSearchExecutionId?: string;
  knowledgeCollectionsUsed?: string[];
  knowledgeDocumentsRetrieved?: number;
  knowledgeAverageSimilarity?: number | null;
  knowledgeRetrievalLatencyMs?: number;
};

export type AIWorkflowNodeOutput =
  | { mode: "text"; text: string }
  | { mode: "json"; value: Record<string, unknown> }
  | { mode: "boolean"; value: boolean }
  | { mode: "classification"; label: string; confidence?: number }
  | { mode: "structured"; value: Record<string, unknown> }
  | { mode: "array"; value: unknown[] };

export type AIWorkflowExecutionResult = {
  rawText: string;
  metadata: AIWorkflowRuntimeMetadata;
  mapped: AIWorkflowNodeOutput;
};
