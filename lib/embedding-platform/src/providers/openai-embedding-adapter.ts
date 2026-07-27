import {
  DEFAULT_PROVIDER_MAX_RETRIES,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from "../constants.js";
import { EmbeddingProviderConfigurationError } from "../errors.js";
import type {
  ConfigurationValidationResult,
  GenerateEmbeddingInput,
  GenerateEmbeddingsBatchInput,
  GenerateEmbeddingsBatchResult,
  GenerateEmbeddingResult,
  HealthResult,
  ModelsResult,
} from "../types.js";
import { validateAgainstSchema } from "../utils/validate-configuration.js";
import type { EmbeddingProvider } from "./provider-contract.js";
import { fetchWithRetry } from "./http/retry-client.js";

const OPENAI_CONFIGURATION_SCHEMA = {
  type: "object",
  properties: {
    model: { type: "string" },
    dimensions: { type: "number" },
    baseUrl: { type: "string" },
    apiKey: { type: "string" },
    timeoutMs: { type: "number" },
    maxRetries: { type: "number" },
  },
  required: ["model"],
} as const;

type OpenAIEmbeddingsResponse = {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage?: { prompt_tokens?: number; total_tokens?: number };
};

type ResolvedOpenAIConfig = {
  model: string;
  dimensions: number;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
};

export class OpenAIEmbeddingAdapter implements EmbeddingProvider {
  readonly key = "openai";

  constructor(
    private readonly configuration: Record<string, unknown>,
    private readonly options?: { fetchFn?: typeof fetch; apiKeyEnvVar?: string },
  ) {}

  validateConfiguration(configuration: Record<string, unknown>): ConfigurationValidationResult {
    return validateAgainstSchema(OPENAI_CONFIGURATION_SCHEMA, configuration);
  }

  private resolveConfig(inputModel?: string, inputDimensions?: number): ResolvedOpenAIConfig {
    const validation = this.validateConfiguration(this.configuration);
    if (!validation.valid) {
      throw new EmbeddingProviderConfigurationError(validation.errors.join("; "));
    }

    const configuredModel = this.configuration.model;
    const model =
      typeof configuredModel === "string" && configuredModel.trim()
        ? configuredModel
        : inputModel ?? "text-embedding-3-small";

    const configuredDimensions = this.configuration.dimensions;
    const dimensions =
      typeof configuredDimensions === "number" && configuredDimensions > 0
        ? configuredDimensions
        : inputDimensions && inputDimensions > 0
          ? inputDimensions
          : 1536;

    const baseUrl =
      typeof this.configuration.baseUrl === "string" && this.configuration.baseUrl.trim()
        ? this.configuration.baseUrl.replace(/\/$/, "")
        : "https://api.openai.com/v1";

    const apiKey =
      typeof this.configuration.apiKey === "string" && this.configuration.apiKey.trim()
        ? this.configuration.apiKey.trim()
        : "";

    if (!apiKey) {
      throw new EmbeddingProviderConfigurationError(
        "OpenAI API key is required. Provide configuration.apiKey on the embedding provider connection.",
      );
    }

    const timeoutMs =
      typeof this.configuration.timeoutMs === "number" && this.configuration.timeoutMs > 0
        ? this.configuration.timeoutMs
        : DEFAULT_REQUEST_TIMEOUT_MS;

    const maxRetries =
      typeof this.configuration.maxRetries === "number" && this.configuration.maxRetries >= 0
        ? this.configuration.maxRetries
        : DEFAULT_PROVIDER_MAX_RETRIES;

    return { model, dimensions, baseUrl, apiKey, timeoutMs, maxRetries };
  }

  private async callEmbeddingsApi(
    inputs: string[],
    config: ResolvedOpenAIConfig,
    inputDimensions?: number,
  ): Promise<{ vectors: number[][]; model: string; tokenCount?: number; latencyMs: number }> {
    const started = Date.now();
    const body: Record<string, unknown> = {
      input: inputs.length === 1 ? inputs[0] : inputs,
      model: config.model,
    };

    const dimensions = inputDimensions ?? config.dimensions;
    if (dimensions > 0) {
      body.dimensions = dimensions;
    }

    const response = await fetchWithRetry(
      `${config.baseUrl}/embeddings`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      {
        timeoutMs: config.timeoutMs,
        maxRetries: config.maxRetries,
        fetchFn: this.options?.fetchFn,
        label: "OpenAI embeddings",
      },
    );

    const payload = (await response.json()) as OpenAIEmbeddingsResponse;
    const vectors = [...payload.data]
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);

    return {
      vectors,
      model: payload.model ?? config.model,
      tokenCount: payload.usage?.total_tokens,
      latencyMs: Date.now() - started,
    };
  }

  async generateEmbedding(input: GenerateEmbeddingInput): Promise<GenerateEmbeddingResult> {
    const config = this.resolveConfig(input.model, input.dimensions);
    const response = await this.callEmbeddingsApi([input.text], config, input.dimensions);
    const vector = response.vectors[0];
    if (!vector) {
      throw new EmbeddingProviderConfigurationError("OpenAI embeddings response did not include a vector.");
    }

    return {
      vector,
      dimensions: vector.length,
      model: response.model,
      providerKey: this.key,
      mock: false,
      latencyMs: response.latencyMs,
      tokenCount: response.tokenCount,
    };
  }

  async generateEmbeddingsBatch(input: GenerateEmbeddingsBatchInput): Promise<GenerateEmbeddingsBatchResult> {
    if (input.items.length === 0) {
      return { results: [], providerKey: this.key, mock: false, latencyMs: 0 };
    }

    const config = this.resolveConfig(input.items[0]?.model, input.items[0]?.dimensions);
    const response = await this.callEmbeddingsApi(
      input.items.map((item) => item.text),
      config,
      input.items[0]?.dimensions,
    );

    const results: GenerateEmbeddingResult[] = response.vectors.map((vector, index) => ({
      vector,
      dimensions: vector.length,
      model: response.model,
      providerKey: this.key,
      mock: false,
      latencyMs: response.latencyMs,
      tokenCount: index === 0 ? response.tokenCount : undefined,
    }));

    return {
      results,
      providerKey: this.key,
      mock: false,
      latencyMs: response.latencyMs,
    };
  }

  async health(): Promise<HealthResult> {
    try {
      const config = this.resolveConfig();
      await this.callEmbeddingsApi(["health-check"], config);
      return {
        status: "connected",
        providerKey: this.key,
        message: "OpenAI embeddings API is reachable.",
        checkedAt: new Date().toISOString(),
        mock: false,
      };
    } catch (error) {
      return {
        status: "error",
        providerKey: this.key,
        message: error instanceof Error ? error.message : "OpenAI health check failed.",
        checkedAt: new Date().toISOString(),
        mock: false,
      };
    }
  }

  async models(): Promise<ModelsResult> {
    const config = this.resolveConfig();
    return {
      models: [{ id: config.model, displayName: config.model, dimensions: config.dimensions }],
      providerKey: this.key,
      mock: false,
    };
  }
}

export function createOpenAIEmbeddingAdapter(
  configuration: Record<string, unknown>,
  options?: { fetchFn?: typeof fetch; apiKeyEnvVar?: string },
): OpenAIEmbeddingAdapter {
  return new OpenAIEmbeddingAdapter(configuration, options);
}
