import type { ExtractionCoercionPolicy, ExtractionFieldType } from "./constants.js";
import type { ExtractionSchema, ExtractionSchemaField } from "./types.js";

export type ExtractionConfidence = {
  overall: number;
  fields: Record<string, number>;
  warnings: string[];
  missingValues: string[];
  correctionHints: string[];
};

export type ExtractionValidationResult = {
  valid: boolean;
  value: Record<string, unknown>;
  errors: string[];
  confidence: ExtractionConfidence;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+]?[\d\s().-]{7,}$/;

function readConfidencePayload(raw: unknown): Partial<ExtractionConfidence> | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const confidence = value.confidence;
  if (!confidence || typeof confidence !== "object") return null;
  const payload = confidence as Record<string, unknown>;
  return {
    overall: typeof payload.overall === "number" ? payload.overall : undefined,
    fields:
      payload.fields && typeof payload.fields === "object"
        ? (payload.fields as Record<string, number>)
        : undefined,
    warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String) : undefined,
    missingValues: Array.isArray(payload.missingValues) ? payload.missingValues.map(String) : undefined,
    correctionHints: Array.isArray(payload.correctionHints) ? payload.correctionHints.map(String) : undefined,
  };
}

function coercePrimitive(
  value: unknown,
  type: ExtractionFieldType,
  policy: ExtractionCoercionPolicy,
  enumValues?: string[] | null,
): { value: unknown; error?: string } {
  if (value === null || value === undefined || value === "") {
    return { value: null };
  }

  switch (type) {
    case "string":
    case "date":
    case "time":
      return { value: String(value) };
    case "number":
    case "currency": {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return { value: parsed };
      return policy === "strict" ? { value, error: "Expected number" } : { value: null, error: "Expected number" };
    }
    case "boolean": {
      if (typeof value === "boolean") return { value };
      const normalized = String(value).trim().toLowerCase();
      if (["true", "yes", "1"].includes(normalized)) return { value: true };
      if (["false", "no", "0"].includes(normalized)) return { value: false };
      return policy === "strict" ? { value, error: "Expected boolean" } : { value: null, error: "Expected boolean" };
    }
    case "email": {
      const text = String(value);
      if (EMAIL_PATTERN.test(text)) return { value: text };
      return policy === "lenient" ? { value: text, error: "Invalid email format" } : { value: null, error: "Invalid email format" };
    }
    case "phone": {
      const text = String(value);
      if (PHONE_PATTERN.test(text)) return { value: text };
      return policy === "lenient" ? { value: text, error: "Invalid phone format" } : { value: null, error: "Invalid phone format" };
    }
    case "enum": {
      const text = String(value);
      if (!enumValues?.length) return { value: text };
      const match = enumValues.find((entry) => entry.toLowerCase() === text.toLowerCase()) ?? enumValues[0];
      return text && enumValues.some((entry) => entry.toLowerCase() === text.toLowerCase())
        ? { value: match }
        : { value: policy === "strict" ? value : match, error: `Expected one of: ${enumValues.join(", ")}` };
    }
    case "array":
      return Array.isArray(value) ? { value } : { value: [value] };
    case "object":
      return value && typeof value === "object" && !Array.isArray(value) ? { value } : { value: null, error: "Expected object" };
    default:
      return { value };
  }
}

function validateFieldTree(
  fields: ExtractionSchemaField[],
  source: Record<string, unknown>,
  policy: ExtractionCoercionPolicy,
  pathPrefix = "",
): { value: Record<string, unknown>; errors: string[]; missing: string[] } {
  const result: Record<string, unknown> = {};
  const errors: string[] = [];
  const missing: string[] = [];

  for (const field of fields) {
    const path = pathPrefix ? `${pathPrefix}.${field.name}` : field.name;
    const rawValue = source[field.name];
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      if (field.required) missing.push(path);
      result[field.name] = null;
      continue;
    }

    if (field.type === "object" && field.children?.length) {
      const nested =
        rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
          ? (rawValue as Record<string, unknown>)
          : {};
      const nestedResult = validateFieldTree(field.children, nested, policy, path);
      result[field.name] = nestedResult.value;
      errors.push(...nestedResult.errors);
      missing.push(...nestedResult.missing);
      continue;
    }

    const coerced = coercePrimitive(rawValue, field.type, policy, field.enumValues);
    result[field.name] = coerced.value;
    if (coerced.error) errors.push(`${path}: ${coerced.error}`);
  }

  return { value: result, errors, missing };
}

export function validateExtractionResult(
  schema: ExtractionSchema,
  rawResponse: unknown,
  policy: ExtractionCoercionPolicy,
): ExtractionValidationResult {
  const payload =
    rawResponse && typeof rawResponse === "object" && !Array.isArray(rawResponse)
      ? (rawResponse as Record<string, unknown>)
      : {};
  const data =
    payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
      ? (payload.data as Record<string, unknown>)
      : payload;
  const confidencePayload = readConfidencePayload(payload);

  const { value, errors, missing } = validateFieldTree(schema.fields, data, policy);
  const extraKeys = Object.keys(data).filter(
    (key) => !schema.fields.some((field) => field.name === key),
  );
  if (extraKeys.length > 0 && policy === "strict") {
    errors.push(`Unexpected fields: ${extraKeys.join(", ")}`);
  }

  const warnings = [...(confidencePayload?.warnings ?? [])];
  const correctionHints = [...(confidencePayload?.correctionHints ?? [])];
  if (extraKeys.length > 0 && policy !== "strict") {
    warnings.push(`Ignored extra fields: ${extraKeys.join(", ")}`);
  }

  const fieldConfidence = confidencePayload?.fields ?? {};
  const overall =
    confidencePayload?.overall ??
    Math.max(
      0,
      Math.min(
        1,
        1 - (errors.length + missing.length) * 0.08,
      ),
    );

  return {
    valid: errors.length === 0,
    value,
    errors,
    confidence: {
      overall,
      fields: fieldConfidence,
      warnings,
      missingValues: [...missing, ...(confidencePayload?.missingValues ?? [])],
      correctionHints,
    },
  };
}

export function schemaToJsonSchema(schema: ExtractionSchema): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const field of schema.fields) {
    properties[field.name] = fieldToJsonSchema(field);
    if (field.required) required.push(field.name);
  }

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

function fieldToJsonSchema(field: ExtractionSchemaField): Record<string, unknown> {
  const base: Record<string, unknown> = {
    description: field.description ?? undefined,
    examples: field.example ? [field.example] : undefined,
  };

  switch (field.type) {
    case "number":
    case "currency":
      return { ...base, type: "number" };
    case "boolean":
      return { ...base, type: "boolean" };
    case "array":
      return {
        ...base,
        type: "array",
        items: field.children?.[0] ? fieldToJsonSchema(field.children[0]) : { type: "string" },
      };
    case "object":
      return {
        ...base,
        type: "object",
        properties: Object.fromEntries((field.children ?? []).map((child) => [child.name, fieldToJsonSchema(child)])),
      };
    case "enum":
      return { ...base, type: "string", enum: field.enumValues ?? [] };
    default:
      return { ...base, type: "string" };
  }
}
