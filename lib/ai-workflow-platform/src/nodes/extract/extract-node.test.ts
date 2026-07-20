import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAIWorkflowPlatformServices,
  createDefaultExtractNodeConfig,
  toAIWorkflowEngineConfig,
  validateExtractionResult,
  validateExtractionSchema,
  schemaToJsonSchema,
} from "../../index.js";

describe("Extraction schema validation", () => {
  it("requires at least one schema field", () => {
    const config = createDefaultExtractNodeConfig();
    config.metadata = {
      extract: {
        ...createDefaultExtractNodeConfig().metadata!.extract!,
        schema: { fields: [] },
      },
    };
    assert.ok(validateExtractionSchema(config).some((issue) => issue.code === "missing_schema"));
  });

  it("builds json schema from visual field definitions", () => {
    const config = createDefaultExtractNodeConfig();
    const schema = schemaToJsonSchema(config.metadata!.extract!.schema);
    assert.equal(schema.type, "object");
    assert.ok(schema.properties && "customer_name" in (schema.properties as Record<string, unknown>));
  });
});

describe("Extraction result validation", () => {
  it("validates and coerces structured model output", () => {
    const config = createDefaultExtractNodeConfig();
    const result = validateExtractionResult(
      config.metadata!.extract!.schema,
      {
        data: {
          customer_name: "Jane Doe",
          email: "jane@example.com",
        },
        confidence: {
          overall: 0.91,
          fields: { customer_name: 0.95, email: 0.88 },
          warnings: [],
          missingValues: [],
          correctionHints: [],
        },
      },
      "coerce",
    );
    assert.equal(result.valid, true);
    assert.equal(result.value.customer_name, "Jane Doe");
    assert.equal(result.confidence.overall, 0.91);
  });

  it("reports missing required fields", () => {
    const config = createDefaultExtractNodeConfig();
    const result = validateExtractionResult(
      config.metadata!.extract!.schema,
      { data: { email: "jane@example.com" } },
      "coerce",
    );
    assert.ok(result.confidence.missingValues.includes("customer_name"));
  });
});

describe("AI Extract node execution", () => {
  it("executes through the shared framework and returns validated structured output", async () => {
    const services = createAIWorkflowPlatformServices({
      registerBuiltIns: true,
      runtime: {
        async buildPrompt() {
          throw new Error("not used");
        },
        async execute() {
          return {
            executionId: "exec-extract-1",
            promptBuildId: "build-extract-1",
            promptVersionId: "v2",
            templateKey: "workflow_extract",
            providerKey: "stub",
            model: "stub-model",
            responseText: JSON.stringify({
              data: { customer_name: "Jane Doe", email: "jane@example.com" },
              confidence: { overall: 0.93, fields: { customer_name: 0.95, email: 0.9 }, warnings: [], missingValues: [], correctionHints: [] },
            }),
            latencyMs: 22,
            gatewayLatencyMs: 11,
            contextSizeBytes: 180,
            tokenUsage: { prompt_tokens: 80, completion_tokens: 40, total_tokens: 120 },
            estimatedCostUsd: 0.003,
            cacheHit: false,
          };
        },
      },
    });

    const bridge = services.createRuntimeBridge(() => ({
      userId: "u1",
      companyId: "c1",
      isSuperAdmin: false,
      hasPermission: () => true,
    }));

    const config = createDefaultExtractNodeConfig();
    config.providerKey = "stub";
    const result = await bridge.executeNode({
      company: { id: "c1" },
      flow: { id: "flow-1" },
      run: { id: "run-1" },
      session: { id: "session-1" },
      variables: { input: "Customer Jane Doe reached out at jane@example.com" },
      customer: { id: null },
      currentNode: { config: toAIWorkflowEngineConfig(config) },
    });

    assert.equal(result.outcome, "continue");
    const extracted = (result.variables as Record<string, unknown>).extract_result as {
      mode: string;
      value: { data: Record<string, unknown>; confidence: { overall: number } };
    };
    assert.equal(extracted.mode, "structured");
    assert.equal(extracted.value.data.customer_name, "Jane Doe");
    assert.equal(extracted.value.confidence.overall, 0.93);

    const metadata = (result.variables as Record<string, unknown>).__aiLastExecution as {
      validationStatus: string;
      extractionConfidence: { overall: number };
    };
    assert.equal(metadata.validationStatus, "valid");
    assert.equal(metadata.extractionConfidence.overall, 0.93);
    assert.ok(services.observability.list().some((event) => event.type === "schema_built"));
    assert.ok(services.observability.list().some((event) => event.type === "extraction_validated"));
  });
});
