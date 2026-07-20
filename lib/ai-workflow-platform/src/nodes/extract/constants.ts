export const AI_EXTRACT_NODE_KEY = "ai.extract" as const;

export const DEFAULT_EXTRACT_PROMPT_TEMPLATE_KEY = "workflow_extract";

export const EXTRACT_INPUT_SOURCES = ["variable", "static", "conversation_message"] as const;
export type ExtractInputSource = (typeof EXTRACT_INPUT_SOURCES)[number];

export const EXTRACT_OUTPUT_MODES = ["structured", "json", "array", "text"] as const;

export const EXTRACTION_FIELD_TYPES = [
  "string",
  "number",
  "boolean",
  "date",
  "time",
  "email",
  "phone",
  "currency",
  "array",
  "object",
  "enum",
] as const;

export type ExtractionFieldType = (typeof EXTRACTION_FIELD_TYPES)[number];

export const DEFAULT_EXTRACT_OUTPUT_VARIABLE = "extract_result";

export const EXTRACTION_COERCION_POLICIES = ["strict", "coerce", "lenient"] as const;
export type ExtractionCoercionPolicy = (typeof EXTRACTION_COERCION_POLICIES)[number];
