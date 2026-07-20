import type { AIWorkflowNodeConfig } from "../../types/configuration.js";
import {
  DEFAULT_SUMMARIZER_OUTPUT_VARIABLE,
  SUMMARY_PRESETS,
  SUMMARIZER_INPUT_SOURCES,
  type SummarizerInputSource,
  type SummaryPreset,
} from "./constants.js";

export type AISummarizerNodeMetadata = {
  inputSource: SummarizerInputSource;
  inputVariable: string | null;
  staticText: string | null;
  summaryPreset: SummaryPreset;
  summaryStyle: string | null;
  maxLength: number | null;
  bulletMode: boolean;
  language: string | null;
  tone: string | null;
};

export function createDefaultSummarizerMetadata(
  overrides: Partial<AISummarizerNodeMetadata> = {},
): AISummarizerNodeMetadata {
  return {
    inputSource: "variable",
    inputVariable: "input",
    staticText: null,
    summaryPreset: "medium",
    summaryStyle: null,
    maxLength: null,
    bulletMode: false,
    language: "English",
    tone: null,
    ...overrides,
  };
}

export function readSummarizerMetadata(config: AIWorkflowNodeConfig): AISummarizerNodeMetadata {
  const raw = config.metadata?.summarizer;
  if (!raw || typeof raw !== "object") return createDefaultSummarizerMetadata();
  const value = raw as Record<string, unknown>;
  const preset = SUMMARY_PRESETS.includes(value.summaryPreset as SummaryPreset)
    ? (value.summaryPreset as SummaryPreset)
    : "medium";
  const inputSource = SUMMARIZER_INPUT_SOURCES.includes(value.inputSource as SummarizerInputSource)
    ? (value.inputSource as SummarizerInputSource)
    : "variable";
  return createDefaultSummarizerMetadata({
    inputSource,
    inputVariable: typeof value.inputVariable === "string" ? value.inputVariable : "input",
    staticText: typeof value.staticText === "string" ? value.staticText : null,
    summaryPreset: preset,
    summaryStyle: typeof value.summaryStyle === "string" ? value.summaryStyle : null,
    maxLength: typeof value.maxLength === "number" ? value.maxLength : null,
    bulletMode: value.bulletMode === true,
    language: typeof value.language === "string" ? value.language : "English",
    tone: typeof value.tone === "string" ? value.tone : null,
  });
}

export function patchSummarizerMetadata(
  config: AIWorkflowNodeConfig,
  patch: Partial<AISummarizerNodeMetadata>,
): AIWorkflowNodeConfig {
  const current = readSummarizerMetadata(config);
  return {
    ...config,
    metadata: {
      ...config.metadata,
      summarizer: {
        ...current,
        ...patch,
      },
    },
  };
}

export function createDefaultSummarizerNodeConfig(): AIWorkflowNodeConfig {
  return {
    nodeKey: "ai.summarizer",
    nodeVersion: "1.0.0",
    promptTemplateKey: "workflow_summarize",
    promptTemplateType: "summarization",
    outputMode: "text",
    outputVariable: DEFAULT_SUMMARIZER_OUTPUT_VARIABLE,
    policies: {
      temperature: 0.2,
      maxTokens: 1024,
      streaming: false,
      responseFormat: "text",
    },
    knowledge: {
      enabled: false,
      collectionId: null,
      embeddingConnectionId: null,
      vectorStoreConnectionId: null,
      maxChunks: 8,
      similarityThreshold: 0.7,
      queryTemplate: null,
    },
    metadata: {
      summarizer: createDefaultSummarizerMetadata(),
    },
  };
}
