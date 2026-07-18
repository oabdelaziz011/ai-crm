import type { JsonSchema } from "../types.js";
import type { ConfigurationValidationResult } from "../types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateAgainstSchema(
  schema: JsonSchema,
  configuration: Record<string, unknown>,
): ConfigurationValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(configuration)) {
    return { valid: false, errors: ["Configuration must be an object."] };
  }

  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  for (const field of required) {
    if (!(field in configuration) || configuration[field] === undefined || configuration[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  const properties = isPlainObject(schema.properties) ? schema.properties : {};
  for (const [key, value] of Object.entries(configuration)) {
    const propertySchema = properties[key];
    if (!propertySchema || !isPlainObject(propertySchema)) continue;

    const expectedType = propertySchema.type;
    if (typeof expectedType !== "string") continue;

    const actualType = Array.isArray(value) ? "array" : typeof value;
    if (expectedType === "string" && actualType !== "string") {
      errors.push(`Field ${key} must be a string.`);
    }
    if (expectedType === "number" && actualType !== "number") {
      errors.push(`Field ${key} must be a number.`);
    }
    if (expectedType === "boolean" && actualType !== "boolean") {
      errors.push(`Field ${key} must be a boolean.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function mergeConfiguration(
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return { ...defaults, ...overrides };
}
