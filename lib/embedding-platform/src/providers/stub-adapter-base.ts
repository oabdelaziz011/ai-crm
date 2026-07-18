import { EmbeddingProviderConfigurationError } from "../errors.js";
import { computeStubVector } from "../utils/embedding-utils.js";
import { validateAgainstSchema } from "../utils/validate-configuration.js";
import type { EmbeddingProvider } from "./provider-contract.js";
import type { JsonSchema } from "../types.js";

type StubAdapterOptions = {
  key: string;
  displayName: string;
  configurationSchema: JsonSchema;
  defaultModel: string;
  defaultDimensions: number;
};

export function createStubEmbeddingAdapterClass(options: StubAdapterOptions) {
  return class StubEmbeddingProvider implements EmbeddingProvider {
    readonly key = options.key;

    constructor(private readonly configuration: Record<string, unknown>) {}

    validateConfiguration(configuration: Record<string, unknown>) {
      return validateAgainstSchema(options.configurationSchema, configuration);
    }

    private assertValidConfiguration(): void {
      const validation = this.validateConfiguration(this.configuration);
      if (!validation.valid) {
        throw new EmbeddingProviderConfigurationError(validation.errors.join("; "));
      }
    }

    private resolveModel(inputModel?: string): string {
      const configuredModel = this.configuration.model;
      if (typeof configuredModel === "string" && configuredModel.trim()) {
        return configuredModel;
      }
      if (inputModel) return inputModel;
      return options.defaultModel;
    }

    private resolveDimensions(inputDimensions?: number): number {
      const configuredDimensions = this.configuration.dimensions;
      if (typeof configuredDimensions === "number" && configuredDimensions > 0) {
        return configuredDimensions;
      }
      if (inputDimensions && inputDimensions > 0) return inputDimensions;
      return options.defaultDimensions;
    }

    async generateEmbedding(input: import("../types.js").GenerateEmbeddingInput) {
      this.assertValidConfiguration();
      const model = this.resolveModel(input.model);
      const dimensions = this.resolveDimensions(input.dimensions);
      return {
        vector: computeStubVector(input.text, dimensions),
        dimensions,
        model,
        providerKey: this.key,
        mock: true as const,
      };
    }

    async health() {
      const validation = this.validateConfiguration(this.configuration);
      return {
        status: validation.valid ? ("connected" as const) : ("warning" as const),
        providerKey: this.key,
        message: validation.valid
          ? `${options.displayName} stub adapter is configured.`
          : validation.errors.join("; "),
        checkedAt: new Date().toISOString(),
        mock: true as const,
      };
    }

    async models() {
      this.assertValidConfiguration();
      const model = this.resolveModel();
      const dimensions = this.resolveDimensions();
      return {
        models: [{ id: model, displayName: model, dimensions }],
        providerKey: this.key,
        mock: true as const,
      };
    }
  };
}
