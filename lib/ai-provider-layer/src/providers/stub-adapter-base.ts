import { AIProviderConfigurationError } from "../errors.js";
import { validateAgainstSchema } from "../utils/validate-configuration.js";
import type { AIProvider } from "./provider-contract.js";
import type { JsonSchema } from "../types.js";

type StubAdapterOptions = {
  key: string;
  displayName: string;
  configurationSchema: JsonSchema;
  defaultModel: string;
  extraRequiredFields?: string[];
};

export function createStubAdapterClass(options: StubAdapterOptions) {
  return class StubAIProvider implements AIProvider {
    readonly key = options.key;

    constructor(private readonly configuration: Record<string, unknown>) {}

    validateConfiguration(configuration: Record<string, unknown>) {
      return validateAgainstSchema(options.configurationSchema, configuration);
    }

    private assertValidConfiguration(): void {
      const validation = this.validateConfiguration(this.configuration);
      if (!validation.valid) {
        throw new AIProviderConfigurationError(validation.errors.join("; "));
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

    async generate(input: import("../types.js").GenerateInput) {
      this.assertValidConfiguration();
      const model = this.resolveModel(input.model);
      return {
        text: `[${options.displayName} stub] Generated response for prompt length ${input.prompt.length}.`,
        model,
        providerKey: this.key,
        mock: true as const,
      };
    }

    async classify(input: import("../types.js").ClassifyInput) {
      this.assertValidConfiguration();
      const label = input.labels?.[0] ?? "general";
      return {
        label,
        confidence: 0.75,
        providerKey: this.key,
        mock: true as const,
      };
    }

    async embed(input: import("../types.js").EmbedInput) {
      this.assertValidConfiguration();
      const model = this.resolveModel(input.model);
      return {
        vector: [0.1, 0.2, 0.3, 0.4],
        dimensions: 4,
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
      return {
        models: [
          {
            id: model,
            displayName: model,
            supportsGenerate: true,
            supportsClassify: true,
            supportsEmbed: true,
          },
        ],
        providerKey: this.key,
        mock: true as const,
      };
    }
  };
}
