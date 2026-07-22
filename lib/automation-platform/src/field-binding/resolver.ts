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
  if (value == null) return "";
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
