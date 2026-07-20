import type { AIWorkflowNodeConfig } from "../../types/configuration.js";
import {
  AI_EXTRACT_NODE_KEY,
  DEFAULT_EXTRACT_OUTPUT_VARIABLE,
  DEFAULT_EXTRACT_PROMPT_TEMPLATE_KEY,
  EXTRACTION_FIELD_TYPES,
  type ExtractInputSource,
  type ExtractionCoercionPolicy,
  type ExtractionFieldType,
} from "./constants.js";

export type ExtractionSchemaField = {
  id: string;
  name: string;
  type: ExtractionFieldType;
  required: boolean;
  description?: string | null;
  example?: string | null;
  enumValues?: string[] | null;
  children?: ExtractionSchemaField[] | null;
};

export type ExtractionSchema = {
  fields: ExtractionSchemaField[];
};

export type AIExtractNodeMetadata = {
  inputSource: ExtractInputSource;
  inputVariable: string | null;
  staticText: string | null;
  businessRules: string | null;
  outputInstructions: string | null;
  coercionPolicy: ExtractionCoercionPolicy;
  schema: ExtractionSchema;
};

export function createDefaultExtractionSchema(): ExtractionSchema {
  return {
    fields: [
      {
        id: "field-customer-name",
        name: "customer_name",
        type: "string",
        required: true,
        description: "Customer full name",
        example: "Jane Doe",
      },
      {
        id: "field-email",
        name: "email",
        type: "email",
        required: false,
        description: "Customer email address",
        example: "jane@example.com",
      },
    ],
  };
}

export function createDefaultExtractMetadata(
  overrides: Partial<AIExtractNodeMetadata> = {},
): AIExtractNodeMetadata {
  return {
    inputSource: "variable",
    inputVariable: "input",
    staticText: null,
    businessRules: "Return only values supported by the input text. Use null for unknown values.",
    outputInstructions: "Return JSON matching the extraction schema exactly.",
    coercionPolicy: "coerce",
    schema: createDefaultExtractionSchema(),
    ...overrides,
  };
}

function normalizeField(raw: Record<string, unknown>): ExtractionSchemaField | null {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;
  const type = EXTRACTION_FIELD_TYPES.includes(raw.type as ExtractionFieldType)
    ? (raw.type as ExtractionFieldType)
    : "string";
  const children = Array.isArray(raw.children)
    ? raw.children
        .map((child) => (child && typeof child === "object" ? normalizeField(child as Record<string, unknown>) : null))
        .filter((child): child is ExtractionSchemaField => Boolean(child))
    : null;
  return {
    id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
    name,
    type,
    required: raw.required === true,
    description: typeof raw.description === "string" ? raw.description : null,
    example: typeof raw.example === "string" ? raw.example : null,
    enumValues: Array.isArray(raw.enumValues) ? raw.enumValues.map(String) : null,
    children,
  };
}

export function normalizeExtractionSchema(raw: Record<string, unknown>): ExtractionSchema {
  const fields = Array.isArray(raw.fields)
    ? raw.fields
        .map((field) => (field && typeof field === "object" ? normalizeField(field as Record<string, unknown>) : null))
        .filter((field): field is ExtractionSchemaField => Boolean(field))
    : [];
  return { fields };
}

export function readExtractMetadata(config: AIWorkflowNodeConfig): AIExtractNodeMetadata {
  const raw = config.metadata?.extract;
  if (!raw || typeof raw !== "object") return createDefaultExtractMetadata();
  const value = raw as Record<string, unknown>;
  const schema =
    value.schema && typeof value.schema === "object"
      ? normalizeExtractionSchema(value.schema as Record<string, unknown>)
      : createDefaultExtractionSchema();
  const inputSource = ["variable", "static", "conversation_message"].includes(String(value.inputSource))
    ? (value.inputSource as ExtractInputSource)
    : "variable";
  return createDefaultExtractMetadata({
    inputSource,
    inputVariable: typeof value.inputVariable === "string" ? value.inputVariable : "input",
    staticText: typeof value.staticText === "string" ? value.staticText : null,
    businessRules: typeof value.businessRules === "string" ? value.businessRules : null,
    outputInstructions: typeof value.outputInstructions === "string" ? value.outputInstructions : null,
    coercionPolicy: ["strict", "coerce", "lenient"].includes(String(value.coercionPolicy))
      ? (value.coercionPolicy as ExtractionCoercionPolicy)
      : "coerce",
    schema,
  });
}

export function patchExtractMetadata(
  config: AIWorkflowNodeConfig,
  patch: Partial<AIExtractNodeMetadata>,
): AIWorkflowNodeConfig {
  const current = readExtractMetadata(config);
  return {
    ...config,
    metadata: {
      ...config.metadata,
      extract: {
        ...current,
        ...patch,
        schema: patch.schema ?? current.schema,
      },
    },
  };
}

export function createDefaultExtractNodeConfig(): AIWorkflowNodeConfig {
  return {
    nodeKey: AI_EXTRACT_NODE_KEY,
    nodeVersion: "1.0.0",
    promptTemplateKey: DEFAULT_EXTRACT_PROMPT_TEMPLATE_KEY,
    promptTemplateType: "extraction",
    outputMode: "structured",
    outputVariable: DEFAULT_EXTRACT_OUTPUT_VARIABLE,
    outputSchema: null,
    policies: {
      temperature: 0,
      maxTokens: 2048,
      streaming: false,
      responseFormat: "json",
    },
    knowledge: {
      enabled: false,
      collectionId: null,
      embeddingConnectionId: null,
      vectorStoreConnectionId: null,
      maxChunks: 8,
      similarityThreshold: 0.7,
      queryTemplate: null,
    },
    metadata: {
      extract: createDefaultExtractMetadata(),
    },
  };
}

export { AI_EXTRACT_NODE_KEY };
