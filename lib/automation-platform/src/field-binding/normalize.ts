import type { FieldBinding } from "./types.js";

export type { FieldBinding };

export function staticBinding(value: string): FieldBinding {
  return { mode: "static", value };
}

export function variableBinding(variable: string): FieldBinding {
  return { mode: "variable", variable };
}

export function isFieldBinding(value: unknown): value is FieldBinding {
  if (!value || typeof value !== "object") return false;
  const mode = (value as FieldBinding).mode;
  if (mode === "static") return typeof (value as { value?: unknown }).value === "string";
  if (mode === "variable") return typeof (value as { variable?: unknown }).variable === "string";
  if (mode === "expression") return typeof (value as { expression?: unknown }).expression === "string";
  if (mode === "formula") return typeof (value as { formula?: unknown }).formula === "string";
  if (mode === "ai_output") return typeof (value as { outputPath?: unknown }).outputPath === "string";
  return false;
}

export function normalizeFieldBinding(value: unknown, fallback: FieldBinding): FieldBinding {
  if (isFieldBinding(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) {
      return variableBinding(trimmed);
    }
    return staticBinding(trimmed);
  }
  return fallback;
}

export function readBindingString(binding: unknown): string {
  if (!isFieldBinding(binding)) return "";
  if (binding.mode === "static") return binding.value;
  if (binding.mode === "variable") return binding.variable;
  return "";
}

export function bindingHasValue(binding: unknown): boolean {
  return readBindingString(binding).trim().length > 0;
}
