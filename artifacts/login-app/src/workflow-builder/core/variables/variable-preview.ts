import { listAllWorkflowVariables } from "./variable-provider-registry";

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function extractVariableTokens(text: string): string[] {
  const matches = [...text.matchAll(TOKEN_PATTERN)];
  return matches.map((match) => `{{${match[1]}}}`);
}

export function renderVariablePreview(text: string, overrides: Record<string, string> = {}): string {
  const variables = listAllWorkflowVariables();
  const lookup = new Map<string, string>();

  for (const variable of variables) {
    const key = variable.token.replace(/^\{\{|\}\}$/g, "").trim();
    lookup.set(variable.token, overrides[variable.token] ?? variable.previewValue ?? variable.label);
    lookup.set(key, overrides[variable.token] ?? variable.previewValue ?? variable.label);
  }

  return text.replace(TOKEN_PATTERN, (_full, path: string) => lookup.get(path) ?? lookup.get(`{{${path}}}`) ?? "…");
}

export function insertVariableAtCursor(text: string, token: string, selectionStart: number, selectionEnd: number): {
  value: string;
  cursor: number;
} {
  const next = `${text.slice(0, selectionStart)}${token}${text.slice(selectionEnd)}`;
  return { value: next, cursor: selectionStart + token.length };
}
