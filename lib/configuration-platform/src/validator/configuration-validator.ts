import type { MetadataFieldDefinition } from "../types.js";

export class ConfigurationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateMetadataFieldValue(
  field: MetadataFieldDefinition,
  value: unknown,
): void {
  if (value === undefined || value === null) {
    if (field.required) throw new ConfigurationValidationError(`${field.key} is required`);
    return;
  }

  switch (field.type) {
    case "text":
      if (typeof value !== "string") throw new ConfigurationValidationError(`${field.key} must be text`);
      break;
    case "boolean":
      if (typeof value !== "boolean") throw new ConfigurationValidationError(`${field.key} must be boolean`);
      break;
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) {
        throw new ConfigurationValidationError(`${field.key} must be a number`);
      }
      break;
    case "json":
    case "object":
      if (!isRecord(value)) throw new ConfigurationValidationError(`${field.key} must be an object`);
      break;
    case "array":
      if (!Array.isArray(value)) throw new ConfigurationValidationError(`${field.key} must be an array`);
      break;
    case "lookup":
      if (typeof value !== "string" && typeof value !== "number") {
        throw new ConfigurationValidationError(`${field.key} must be a lookup value`);
      }
      break;
    case "formula":
      if (typeof value !== "string") throw new ConfigurationValidationError(`${field.key} must be a formula string`);
      break;
    default:
      break;
  }

  const minLength = field.validation?.minLength;
  if (typeof minLength === "number" && typeof value === "string" && value.length < minLength) {
    throw new ConfigurationValidationError(`${field.key} is too short`);
  }
}

export function validateConfigurationPayload(
  config: Record<string, unknown>,
  schema?: readonly MetadataFieldDefinition[],
): Record<string, unknown> {
  if (!isRecord(config)) throw new ConfigurationValidationError("Configuration must be an object");

  if (!schema?.length) return Object.freeze({ ...config });

  const normalized: Record<string, unknown> = { ...config };
  for (const field of schema) {
    const value = normalized[field.key] ?? field.defaultValue;
    validateMetadataFieldValue(field, value);
    if (value !== undefined) normalized[field.key] = value;
  }

  return Object.freeze(normalized);
}

export function assertConfigurationDomain(domain: string, allowed: readonly string[]): void {
  if (!allowed.includes(domain)) {
    throw new ConfigurationValidationError(`Unknown configuration domain: ${domain}`);
  }
}
