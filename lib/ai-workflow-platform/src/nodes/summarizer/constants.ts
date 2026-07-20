export const AI_SUMMARIZER_NODE_KEY = "ai.summarizer" as const;

export const DEFAULT_SUMMARIZER_PROMPT_TEMPLATE_KEY = "workflow_summarize";

export const SUMMARIZER_INPUT_SOURCES = ["variable", "static"] as const;
export type SummarizerInputSource = (typeof SUMMARIZER_INPUT_SOURCES)[number];

export const SUMMARY_PRESETS = [
  "short",
  "medium",
  "detailed",
  "bullet_points",
  "executive",
  "custom",
] as const;

export type SummaryPreset = (typeof SUMMARY_PRESETS)[number];

export type SummaryPresetDefinition = {
  label: string;
  style: string;
  maxLength: number;
  bulletMode: boolean;
  tone: string;
  promptHint: string;
  estimatedOutputTokens: number;
};

export const SUMMARY_PRESET_DEFINITIONS: Record<SummaryPreset, SummaryPresetDefinition> = {
  short: {
    label: "Short",
    style: "short",
    maxLength: 120,
    bulletMode: false,
    tone: "neutral",
    promptHint: "Summarize in 2-3 concise sentences.",
    estimatedOutputTokens: 80,
  },
  medium: {
    label: "Medium",
    style: "medium",
    maxLength: 300,
    bulletMode: false,
    tone: "neutral",
    promptHint: "Summarize with the most important points in one short paragraph.",
    estimatedOutputTokens: 180,
  },
  detailed: {
    label: "Detailed",
    style: "detailed",
    maxLength: 800,
    bulletMode: false,
    tone: "informative",
    promptHint: "Provide a thorough summary covering key details and context.",
    estimatedOutputTokens: 450,
  },
  bullet_points: {
    label: "Bullet Points",
    style: "bullet_points",
    maxLength: 400,
    bulletMode: true,
    tone: "neutral",
    promptHint: "Summarize as clear bullet points.",
    estimatedOutputTokens: 220,
  },
  executive: {
    label: "Executive Summary",
    style: "executive",
    maxLength: 250,
    bulletMode: false,
    tone: "professional",
    promptHint: "Write an executive summary focused on decisions, impact, and next steps.",
    estimatedOutputTokens: 160,
  },
  custom: {
    label: "Custom",
    style: "custom",
    maxLength: 500,
    bulletMode: false,
    tone: "neutral",
    promptHint: "Follow the configured style, tone, and length constraints.",
    estimatedOutputTokens: 250,
  },
};

export const DEFAULT_SUMMARIZER_OUTPUT_VARIABLE = "summary_result";
