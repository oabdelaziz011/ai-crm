import type { AIWorkflowAutomationContext } from "../../types/automation-context.js";
import type { AIWorkflowNodeConfig } from "../../types/configuration.js";
import { SUMMARY_PRESET_DEFINITIONS } from "./constants.js";
import { readSummarizerMetadata } from "./types.js";

function readVariableValue(variables: Record<string, unknown>, key: string): unknown {
  return variables[key];
}

function stringifyInput(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function resolveSummarizerInput(
  config: AIWorkflowNodeConfig,
  variables: Record<string, unknown>,
): string {
  const summarizer = readSummarizerMetadata(config);
  if (summarizer.inputSource === "static") {
    return summarizer.staticText?.trim() ?? "";
  }
  const key = summarizer.inputVariable?.trim() ?? "input";
  return stringifyInput(readVariableValue(variables, key)).trim();
}

export function buildSummarizerPromptContext(
  config: AIWorkflowNodeConfig,
  context: AIWorkflowAutomationContext,
): Record<string, unknown> {
  const summarizer = readSummarizerMetadata(config);
  const preset = SUMMARY_PRESET_DEFINITIONS[summarizer.summaryPreset];
  const input = resolveSummarizerInput(config, context.variables);

  return {
    summary: {
      input,
      style: summarizer.summaryStyle ?? preset.style,
      tone: summarizer.tone ?? preset.tone,
      language: summarizer.language ?? "English",
      maxLength: summarizer.maxLength ?? preset.maxLength,
      bulletMode: summarizer.bulletMode || preset.bulletMode,
      preset: summarizer.summaryPreset,
      instructions: preset.promptHint,
    },
  };
}

export function estimateSummarizerTokenRange(
  config: AIWorkflowNodeConfig,
  inputText: string,
): { min: number; max: number } {
  const summarizer = readSummarizerMetadata(config);
  const preset = SUMMARY_PRESET_DEFINITIONS[summarizer.summaryPreset];
  const inputTokens = Math.max(1, Math.ceil(inputText.length / 4));
  const outputTokens = summarizer.maxLength
    ? Math.ceil(summarizer.maxLength / 4)
    : preset.estimatedOutputTokens;
  return {
    min: inputTokens + Math.ceil(outputTokens * 0.6),
    max: inputTokens + outputTokens + 128,
  };
}
