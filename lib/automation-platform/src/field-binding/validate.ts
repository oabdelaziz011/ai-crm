import { bindingHasValue, isFieldBinding } from "./normalize.js";

export function validateFieldBinding(binding: unknown, fieldLabel: string): string[] {
  if (!isFieldBinding(binding)) {
    return [`Choose a value for ${fieldLabel}.`];
  }
  if (binding.mode === "expression" || binding.mode === "formula" || binding.mode === "ai_output") {
    return [`${fieldLabel} uses an unsupported binding mode.`];
  }
  if (!bindingHasValue(binding)) {
    return [`Add ${fieldLabel} before publishing.`];
  }
  return [];
}

export function validateOptionalFieldBinding(binding: unknown, fieldLabel: string): string[] {
  if (binding == null) return [];
  if (!isFieldBinding(binding)) return [];
  if (binding.mode === "expression" || binding.mode === "formula" || binding.mode === "ai_output") {
    return [`${fieldLabel} uses an unsupported binding mode.`];
  }
  return [];
}
