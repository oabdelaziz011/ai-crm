import {
  extractUniqueVariablePaths,
  findDuplicateVariablePaths,
  hasInvalidVariableSyntax,
} from "../rendering/variable-parser.js";
import type { PromptSectionKey } from "../constants.js";
import type { PromptSectionConfig, PromptTemplateVersionRecord } from "../types.js";

export type PromptValidationSeverity = "error" | "warning";

export type PromptValidationIssue = {
  id: string;
  message: string;
  severity: PromptValidationSeverity;
  sectionKey?: PromptSectionKey;
};

export type PromptValidationInput = {
  sections: Partial<Record<PromptSectionKey, PromptSectionConfig>>;
  outputContractInstructions?: string;
  knownVariables?: string[];
  maxLength?: number;
  strictVariables?: boolean;
};

export class PromptValidator {
  validate(input: PromptValidationInput): PromptValidationIssue[] {
    const issues: PromptValidationIssue[] = [];
    const known = new Set(input.knownVariables ?? []);
    const usedVariables = new Set<string>();
    let totalLength = 0;

    for (const [sectionKey, config] of Object.entries(input.sections) as Array<
      [PromptSectionKey, PromptSectionConfig]
    >) {
      if (config?.enabled === false) continue;
      const content = config?.content?.trim() ?? "";
      if (!content) {
        issues.push({
          id: `empty-${sectionKey}`,
          message: `Section ${sectionKey} is enabled but empty.`,
          severity: "error",
          sectionKey,
        });
        continue;
      }

      totalLength += content.length;

      if (hasInvalidVariableSyntax(content)) {
        issues.push({
          id: `invalid-syntax-${sectionKey}`,
          message: `Section ${sectionKey} contains invalid variable syntax.`,
          severity: "error",
          sectionKey,
        });
      }

      for (const duplicate of findDuplicateVariablePaths(content)) {
        issues.push({
          id: `duplicate-${sectionKey}-${duplicate}`,
          message: `Duplicate variable reference {{${duplicate}}} in section ${sectionKey}.`,
          severity: "warning",
          sectionKey,
        });
      }

      for (const variable of extractUniqueVariablePaths(content)) {
        usedVariables.add(variable);
        if (input.strictVariables && known.size > 0 && !known.has(variable)) {
          issues.push({
            id: `unknown-${sectionKey}-${variable}`,
            message: `Unknown variable {{${variable}}} in section ${sectionKey}.`,
            severity: "error",
            sectionKey,
          });
        }
      }
    }

    if (input.outputContractInstructions?.trim()) {
      totalLength += input.outputContractInstructions.length;
      for (const variable of extractUniqueVariablePaths(input.outputContractInstructions)) {
        usedVariables.add(variable);
      }
    }

    if (totalLength === 0) {
      issues.push({
        id: "empty-prompt",
        message: "Prompt content is empty.",
        severity: "error",
      });
    }

    if (input.maxLength && totalLength > input.maxLength) {
      issues.push({
        id: "max-length",
        message: `Prompt exceeds maximum length of ${input.maxLength} characters (${totalLength}).`,
        severity: "error",
      });
    }

    for (const knownVariable of known) {
      if (!usedVariables.has(knownVariable)) {
        issues.push({
          id: `unused-${knownVariable}`,
          message: `Variable {{${knownVariable}}} is declared but unused.`,
          severity: "warning",
        });
      }
    }

    return issues;
  }

  hasBlockingIssues(issues: PromptValidationIssue[]): boolean {
    return issues.some((issue) => issue.severity === "error");
  }

  validateVersion(version: PromptTemplateVersionRecord, options?: Omit<PromptValidationInput, "sections">) {
    return this.validate({
      sections: version.sections,
      outputContractInstructions: version.output_contract.instructions,
      ...options,
    });
  }
}
