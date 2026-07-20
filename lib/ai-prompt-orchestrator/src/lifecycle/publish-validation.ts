import { PromptValidator } from "../validation/prompt-validator.js";
import type { PromptTemplateVersionRecord } from "../types.js";
import type { PromptPublishValidationIssue } from "./types.js";

export function validatePromptVersionForPublish(
  version: PromptTemplateVersionRecord,
  options?: { maxLength?: number; knownVariables?: string[] },
): PromptPublishValidationIssue[] {
  const validator = new PromptValidator();
  const issues = validator.validateVersion(version, {
    maxLength: options?.maxLength ?? 32000,
    knownVariables: options?.knownVariables,
    strictVariables: false,
  });

  const hasContent = Object.entries(version.sections).some(([, config]) => {
    if (config?.enabled === false) return false;
    return Boolean(config?.content?.trim());
  });

  if (!hasContent) {
    issues.push({
      id: "missing-content",
      message: "Published prompts must include at least one enabled section with content.",
      severity: "error",
    });
  }

  if (!version.version_label.trim()) {
    issues.push({
      id: "missing-version-label",
      message: "Version label is required before publishing.",
      severity: "error",
    });
  }

  return issues;
}

export function hasBlockingPublishIssues(issues: PromptPublishValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
