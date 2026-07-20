import type { AIWorkflowAutomationContext } from "../../types/automation-context.js";
import type { AIWorkflowNodeConfig } from "../../types/configuration.js";
import { readExtractMetadata } from "./types.js";
import { schemaToJsonSchema } from "./result-validator.js";

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

export function resolveExtractInput(
  config: AIWorkflowNodeConfig,
  context: AIWorkflowAutomationContext,
): string {
  const extract = readExtractMetadata(config);
  if (extract.inputSource === "static") {
    return extract.staticText?.trim() ?? "";
  }
  if (extract.inputSource === "conversation_message") {
    return stringifyInput(
      context.variables.__lastUserMessage ??
        context.input?.message ??
        context.variables.input ??
        "",
    ).trim();
  }
  const key = extract.inputVariable?.trim() ?? "input";
  return stringifyInput(context.variables[key]).trim();
}

export function buildExtractPromptContext(
  config: AIWorkflowNodeConfig,
  context: AIWorkflowAutomationContext,
): Record<string, unknown> {
  const extract = readExtractMetadata(config);
  const input = resolveExtractInput(config, context);
  const schemaJson = schemaToJsonSchema(extract.schema);

  return {
    extract: {
      input,
      schema: schemaJson,
      schemaFields: extract.schema.fields,
      outputInstructions: extract.outputInstructions,
      businessRules: extract.businessRules,
      coercionPolicy: extract.coercionPolicy,
    },
  };
}

export function estimateExtractTokenRange(inputText: string, fieldCount: number): { min: number; max: number } {
  const inputTokens = Math.max(1, Math.ceil(inputText.length / 4));
  const schemaTokens = Math.max(32, fieldCount * 24);
  const outputTokens = Math.max(64, fieldCount * 16);
  return {
    min: inputTokens + schemaTokens + Math.ceil(outputTokens * 0.5),
    max: inputTokens + schemaTokens + outputTokens + 256,
  };
}
