import type { AIOutputMode } from "../constants.js";
import type { AIWorkflowNodeConfig } from "../types/configuration.js";
import type { AIWorkflowNodeOutput } from "../types/metadata.js";

export type OutputMapper = (rawText: string, config: AIWorkflowNodeConfig) => AIWorkflowNodeOutput;

export class OutputMapperRegistry {
  private readonly mappers = new Map<AIOutputMode, OutputMapper>();

  register(mode: AIOutputMode, mapper: OutputMapper): this {
    this.mappers.set(mode, mapper);
    return this;
  }

  registerMany(entries: Array<[AIOutputMode, OutputMapper]>): this {
    for (const [mode, mapper] of entries) this.register(mode, mapper);
    return this;
  }

  get(mode: AIOutputMode): OutputMapper {
    const mapper = this.mappers.get(mode);
    if (!mapper) throw new Error(`No output mapper registered for mode: ${mode}`);
    return mapper;
  }

  has(mode: AIOutputMode): boolean {
    return this.mappers.has(mode);
  }

  map(rawText: string, config: AIWorkflowNodeConfig): AIWorkflowNodeOutput {
    return this.get(config.outputMode)(rawText, config);
  }
}

function parseJsonObject(rawText: string): Record<string, unknown> {
  const trimmed = rawText.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const payload = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  const parsed = JSON.parse(payload) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected JSON object output.");
  }
  return parsed as Record<string, unknown>;
}

function parseJsonArray(rawText: string): unknown[] {
  const trimmed = rawText.trim();
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  const payload = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  const parsed = JSON.parse(payload) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Expected JSON array output.");
  return parsed;
}

export function createDefaultOutputMapperRegistry(): OutputMapperRegistry {
  return new OutputMapperRegistry()
    .register("text", (rawText) => ({ mode: "text", text: rawText.trim() }))
    .register("json", (rawText) => ({ mode: "json", value: parseJsonObject(rawText) }))
    .register("boolean", (rawText) => {
      const normalized = rawText.trim().toLowerCase();
      const value = normalized === "true" || normalized === "yes" || normalized === "1";
      return { mode: "boolean", value };
    })
    .register("classification", (rawText, config) => {
      const schema = config.outputSchema;
      const labels = Array.isArray(schema?.labels) ? (schema.labels as string[]) : [];
      const normalized = rawText.trim().toLowerCase();
      const label =
        labels.find((entry) => entry.toLowerCase() === normalized) ??
        labels[0] ??
        rawText.trim();
      return { mode: "classification", label, confidence: undefined };
    })
    .register("structured", (rawText, config) => {
      const parsed = parseJsonObject(rawText);
      if (config.outputSchema && typeof config.outputSchema === "object") {
        return { mode: "structured", value: { ...config.outputSchema, ...parsed } };
      }
      return { mode: "structured", value: parsed };
    })
    .register("array", (rawText) => ({ mode: "array", value: parseJsonArray(rawText) }));
}
