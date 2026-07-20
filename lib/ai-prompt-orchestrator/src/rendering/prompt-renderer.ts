import {
  extractUniqueVariablePaths,
  extractVariableReferences,
} from "./variable-parser.js";
import {
  buildVariableContext,
  resolveVariablePath,
  type VariableResolutionContext,
} from "../providers/variable-providers.js";
import type { VariableProviderRegistry } from "../providers/variable-provider-registry.js";

export type PromptRenderOptions = {
  locale?: string;
  missingVariablePolicy?: "empty" | "placeholder" | "preserve";
  escapeValues?: boolean;
};

export type RenderedPromptResult = {
  text: string;
  resolvedVariables: string[];
  unresolvedVariables: string[];
  variableCount: number;
};

function escapeRenderedValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatResolvedValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => formatResolvedValue(item)).join(", ");
  return JSON.stringify(value, null, 2);
}

function resolveMissingVariable(
  path: string,
  policy: NonNullable<PromptRenderOptions["missingVariablePolicy"]>,
): string {
  if (policy === "preserve") return `{{${path}}}`;
  if (policy === "placeholder") return `[missing:${path}]`;
  return "";
}

export class PromptRenderer {
  constructor(private readonly variableRegistry: VariableProviderRegistry) {}

  renderTemplate(
    template: string,
    sourceContext: VariableResolutionContext,
    options: PromptRenderOptions = {},
  ): RenderedPromptResult {
    const context = buildVariableContext(this.variableRegistry.list(), sourceContext);
    const missingPolicy = options.missingVariablePolicy ?? "empty";
    const escapeValues = options.escapeValues ?? true;
    const resolvedVariables: string[] = [];
    const unresolvedVariables: string[] = [];

    const text = template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, rawPath: string) => {
      const path = rawPath.trim();
      const value = resolveVariablePath(context, path);
      if (value === undefined) {
        unresolvedVariables.push(path);
        return resolveMissingVariable(path, missingPolicy);
      }
      resolvedVariables.push(path);
      const formatted = formatResolvedValue(value);
      return escapeValues ? escapeRenderedValue(formatted) : formatted;
    });

    return {
      text,
      resolvedVariables: [...new Set(resolvedVariables)],
      unresolvedVariables: [...new Set(unresolvedVariables)],
      variableCount: extractUniqueVariablePaths(template).length,
    };
  }

  listKnownVariablePaths(): string[] {
    return [
      "customer.name",
      "customer.phone",
      "customer.email",
      "company.name",
      "conversation.history",
      "conversation.summary",
      "workflow.input",
      "workflow.variables",
      "booking.date",
      "system.time",
      "knowledge.context",
      "knowledge.chunkCount",
      "summary.input",
      "summary.style",
      "summary.tone",
      "summary.language",
      "summary.maxLength",
      "summary.bulletMode",
      "summary.instructions",
      "summary.preset",
      "extract.input",
      "extract.schema",
      "extract.businessRules",
      "extract.outputInstructions",
      "extract.coercionPolicy",
      "decision.input",
      "decision.mode",
      "decision.modeLabel",
      "decision.options",
      "decision.rules",
      "decision.examples",
      "decision.confidenceThreshold",
      "decision.fallbackOutcomeId",
    ];
  }

  extractVariables(template: string): string[] {
    return extractUniqueVariablePaths(template);
  }

  extractReferences(template: string) {
    return extractVariableReferences(template);
  }
}

export function estimatePromptTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
