import type { ValidationIssue } from "../types";

const WORKFLOW_VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeListNodeConfig(config: Record<string, unknown>): Record<string, unknown> {
  const saveAs = readString(config.saveAs) || readString(config.inputKey);
  return {
    ...config,
    ...(saveAs ? { saveAs } : {}),
  };
}

export function validateListVariableBinding(config: Record<string, unknown>, nodeId: string): ValidationIssue[] {
  const saveAs = readString(config.saveAs);
  if (!saveAs) return [];

  if (!WORKFLOW_VARIABLE_NAME_PATTERN.test(saveAs)) {
    return [
      {
        id: `${nodeId}-saveAs-invalid`,
        nodeId,
        message: "Use a valid workflow variable name (letters, numbers, underscores; must start with a letter or underscore).",
        severity: "error",
        fieldLabelKey: "saveSelectedValueAs",
      },
    ];
  }

  return [];
}
