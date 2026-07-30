import { resolveFieldValue } from "../logic/expression-engine.js";

function readString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) {
      const resolved = resolveFieldValue(trimmed, {});
      return resolved == null ? trimmed : normalizeLookupFilterValue("", resolved);
    }
    return trimmed;
  }
  return normalizeLookupFilterValue("", value);
}

function normalizeLookupFilterValue(key: string, value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (key === "date" && typeof record.date === "string") return record.date.trim();
    if (typeof record.id === "string" && record.id.trim()) return record.id.trim();
    if (typeof record.value === "string" && record.value.trim()) return record.value.trim();
  }
  return String(value).trim();
}

export function resolveLookupFilterValues(
  filters: Record<string, unknown> | undefined,
  variables: Record<string, unknown>,
): Record<string, string> {
  if (!filters) return {};
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value == null || value === "") continue;
    if (typeof value === "string" && value.includes("{{")) {
      const normalized = value.replace(/^\{\{|\}\}$/g, "").trim();
      const resolvedValue = resolveFieldValue(
        value.startsWith("{{") ? value : `{{${normalized}}}`,
        variables,
      );
      const normalizedValue = normalizeLookupFilterValue(key, resolvedValue);
      if (normalizedValue) {
        resolved[key] = normalizedValue;
      } else {
        const fallback = readString(value);
        if (fallback) resolved[key] = fallback;
      }
      continue;
    }
    const literal = normalizeLookupFilterValue(key, value);
    if (literal) resolved[key] = literal;
  }
  return resolved;
}
