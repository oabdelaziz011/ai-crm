import { ValidationError } from "../errors.js";
import { resolveFieldValue } from "../logic/expression-engine.js";
import { isFieldBinding } from "./normalize.js";

export function buildActionVariableScope(
  variables: Record<string, unknown>,
  customerId: string | null,
): Record<string, unknown> {
  const existingCustomer =
    variables.customer && typeof variables.customer === "object" && !Array.isArray(variables.customer)
      ? (variables.customer as Record<string, unknown>)
      : {};

  return {
    ...variables,
    customer: {
      ...existingCustomer,
      id: customerId ?? existingCustomer.id ?? null,
    },
  };
}

export function resolveFieldBinding(binding: unknown, scope: Record<string, unknown>): unknown {
  if (!isFieldBinding(binding)) {
    throw new ValidationError("Field binding is missing or invalid.");
  }

  switch (binding.mode) {
    case "static":
      return binding.value;
    case "variable":
      return resolveFieldValue(binding.variable, scope);
    case "expression":
    case "formula":
    case "ai_output":
      throw new ValidationError(`Field binding mode "${binding.mode}" is not supported yet.`);
    default:
      throw new ValidationError("Unsupported field binding mode.");
  }
}

export function resolveFieldBindingAsString(binding: unknown, scope: Record<string, unknown>): string {
  const value = resolveFieldBinding(binding, scope);
  return coerceBindingStringValue(value);
}

export function coerceBindingStringValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.date === "string") return record.date.trim();
    if (typeof record.name === "string") return record.name.trim();
    if (typeof record.display_date === "string") return record.display_date.trim();
    if (typeof record.display_time === "string") return record.display_time.trim();
    if (typeof record.start_at === "string") return record.start_at.trim();
    if (typeof record.id === "string") return record.id.trim();
    if (typeof record.value === "string") return record.value.trim();
  }
  return String(value).trim();
}

export function resolveRequiredFieldBindingAsString(
  binding: unknown,
  scope: Record<string, unknown>,
  fieldLabel: string,
): string {
  const resolved = resolveFieldBindingAsString(binding, scope);
  if (!resolved) {
    throw new ValidationError(`Create booking requires ${fieldLabel}.`);
  }
  return resolved;
}
