import {
  DEFAULT_PROVIDER_MAX_RETRIES,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from "../constants.js";
import { AIProviderConfigurationError } from "../errors.js";
import type {
  ClassifyInput,
  ClassifyResult,
  ConfigurationValidationResult,
  EmbedInput,
  EmbedResult,
  GenerateInput,
  GenerateMetadata,
  GenerateResult,
  HealthResult,
  ModelsResult,
  ProviderTokenUsage,
} from "../types.js";
import { validateAgainstSchema } from "../utils/validate-configuration.js";
import type { AIProvider } from "./provider-contract.js";
import { fetchWithRetry } from "./http/retry-client.js";

const OPENAI_CONFIGURATION_SCHEMA = {
  type: "object",
  properties: {
    model: { type: "string" },
    baseUrl: { type: "string" },
    apiKey: { type: "string" },
    organizationId: { type: "string" },
    timeoutMs: { type: "number" },
    maxRetries: { type: "number" },
  },
  required: ["model"],
} as const;

type ResolvedOpenAIConfig = {
  model: string;
  baseUrl: string;
  apiKey: string;
  organizationId: string | null;
  timeoutMs: number;
  maxRetries: number;
};

type OpenAIChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenAIChatCompletionResponse = {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message?: { role: string; content: string };
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export type OpenAIChatAdapterOptions = {
  fetchFn?: typeof fetch;
  apiKeyEnvVar?: string;
};

export function createOpenAIChatAdapter(
  configuration: Record<string, unknown>,
  options?: OpenAIChatAdapterOptions,
): AIProvider {
  return new OpenAIChatAdapter(configuration, options);
}

export class OpenAIChatAdapter implements AIProvider {
  readonly key = "openai";

  constructor(
    private readonly configuration: Record<string, unknown>,
    private readonly options?: OpenAIChatAdapterOptions,
  ) {}

  validateConfiguration(configuration: Record<string, unknown>): ConfigurationValidationResult {
    return validateAgainstSchema(OPENAI_CONFIGURATION_SCHEMA, configuration);
  }

  private resolveConfig(inputModel?: string): ResolvedOpenAIConfig {
    const validation = this.validateConfiguration(this.configuration);
    if (!validation.valid) {
      throw new AIProviderConfigurationError(validation.errors.join("; "));
    }

    const configuredModel = this.configuration.model;
    const model =
      typeof configuredModel === "string" && configuredModel.trim()
        ? configuredModel
        : inputModel ?? "gpt-4o-mini";

    const baseUrl =
      typeof this.configuration.baseUrl === "string" && this.configuration.baseUrl.trim()
        ? this.configuration.baseUrl.replace(/\/$/, "")
        : "https://api.openai.com/v1";

    const envVar = this.options?.apiKeyEnvVar ?? "OPENAI_API_KEY";
    const apiKey =
      (typeof this.configuration.apiKey === "string" && this.configuration.apiKey.trim()) ||
      (typeof process.env[envVar] === "string" ? process.env[envVar] : "");

    if (!apiKey) {
      throw new AIProviderConfigurationError(
        `OpenAI API key is required. Provide configuration.apiKey or set ${envVar}.`,
      );
    }

    const organizationId =
      typeof this.configuration.organizationId === "string" && this.configuration.organizationId.trim()
        ? this.configuration.organizationId
        : null;

    const timeoutMs =
      typeof this.configuration.timeoutMs === "number" && this.configuration.timeoutMs > 0
        ? this.configuration.timeoutMs
        : DEFAULT_REQUEST_TIMEOUT_MS;

    const maxRetries =
      typeof this.configuration.maxRetries === "number" && this.configuration.maxRetries >= 0
        ? this.configuration.maxRetries
        : DEFAULT_PROVIDER_MAX_RETRIES;

    return { model, baseUrl, apiKey, organizationId, timeoutMs, maxRetries };
  }

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const config = this.resolveConfig(input.model);
    const metadata = input.metadata ?? {};
    const messages = parsePromptToMessages(input.prompt);
    const streaming = Boolean(metadata.streaming);

    const body = buildChatCompletionBody(config.model, messages, metadata, streaming);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    };
    if (config.organizationId) {
      headers["OpenAI-Organization"] = config.organizationId;
    }

    const response = await fetchWithRetry(
      `${config.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
      {
        timeoutMs: config.timeoutMs,
        maxRetries: config.maxRetries,
        fetchFn: this.options?.fetchFn,
        label: "OpenAI chat completion",
      },
    );

    if (streaming) {
      return this.consumeStream(response, config.model, metadata);
    }

    const payload = (await response.json()) as OpenAIChatCompletionResponse;
    const text = payload.choices?.[0]?.message?.content ?? "";
    const finishReason = payload.choices?.[0]?.finish_reason ?? "stop";

    return {
      text,
      model: payload.model ?? config.model,
      providerKey: this.key,
      mock: false,
      tokenUsage: normalizeUsage(payload.usage),
      finishReason,
    };
  }

  private async consumeStream(
    response: Response,
    model: string,
    metadata: GenerateMetadata,
  ): Promise<GenerateResult> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new AIProviderConfigurationError("OpenAI streaming response did not include a body.");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let finishReason = "stop";
    let tokenUsage: ProviderTokenUsage | undefined;
    let resolvedModel = model;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const payloadText = trimmed.slice(5).trim();
        if (!payloadText || payloadText === "[DONE]") continue;

        const payload = JSON.parse(payloadText) as OpenAIChatCompletionResponse;
        resolvedModel = payload.model ?? resolvedModel;
        const delta = payload.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          text += delta;
          metadata.onChunk?.(delta);
        }
        if (payload.choices?.[0]?.finish_reason) {
          finishReason = payload.choices[0].finish_reason ?? finishReason;
        }
        if (payload.usage) {
          tokenUsage = normalizeUsage(payload.usage);
        }
      }
    }

    return {
      text,
      model: resolvedModel,
      providerKey: this.key,
      mock: false,
      tokenUsage,
      finishReason,
    };
  }

  async classify(input: ClassifyInput): Promise<ClassifyResult> {
    const labels = input.labels?.length ? input.labels.join(", ") : "general, billing, support";
    const result = await this.generate({
      prompt: `Classify the following text into one of these labels: ${labels}.\nRespond with only the label.\n\nText:\n${input.text}`,
      metadata: { temperature: 0, max_tokens: 32, response_format: "text" },
    });
    const label = result.text.trim().split(/\s+/)[0]?.replace(/[^\w-]/g, "") ?? "general";
    return {
      label: input.labels?.includes(label) ? label : input.labels?.[0] ?? label,
      confidence: 0.82,
      providerKey: this.key,
      mock: false,
    };
  }

  async embed(input: EmbedInput): Promise<EmbedResult> {
    const config = this.resolveConfig(input.model);
    const response = await fetchWithRetry(
      `${config.baseUrl}/embeddings`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: input.text,
          model: config.model.includes("embedding") ? config.model : "text-embedding-3-small",
        }),
      },
      {
        timeoutMs: config.timeoutMs,
        maxRetries: config.maxRetries,
        fetchFn: this.options?.fetchFn,
        label: "OpenAI embeddings",
      },
    );

    const payload = (await response.json()) as {
      data?: Array<{ embedding: number[] }>;
      model?: string;
    };

    const vector = payload.data?.[0]?.embedding ?? [];
    return {
      vector,
      dimensions: vector.length,
      model: payload.model ?? "text-embedding-3-small",
      providerKey: this.key,
      mock: false,
    };
  }

  async health(): Promise<HealthResult> {
    try {
      this.resolveConfig();
      return {
        status: "connected",
        providerKey: this.key,
        message: "OpenAI chat adapter is configured.",
        checkedAt: new Date().toISOString(),
        mock: false,
      };
    } catch (error) {
      return {
        status: "warning",
        providerKey: this.key,
        message: error instanceof Error ? error.message : "OpenAI configuration invalid.",
        checkedAt: new Date().toISOString(),
        mock: false,
      };
    }
  }

  async models(): Promise<ModelsResult> {
    const config = this.resolveConfig();
    return {
      models: [
        {
          id: config.model,
          displayName: config.model,
          supportsGenerate: true,
          supportsClassify: true,
          supportsEmbed: false,
        },
      ],
      providerKey: this.key,
      mock: false,
    };
  }
}

function isGpt5FamilyModel(model: string): boolean {
  return model.trim().toLowerCase().startsWith("gpt-5");
}

function buildChatCompletionBody(
  model: string,
  messages: OpenAIChatMessage[],
  metadata: GenerateMetadata,
  streaming: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: streaming,
  };

  const completionLimit =
    typeof metadata.max_completion_tokens === "number"
      ? metadata.max_completion_tokens
      : metadata.max_tokens ?? 1024;

  if (isGpt5FamilyModel(model)) {
    body.max_completion_tokens = completionLimit;
    if (metadata.temperature === 1) {
      body.temperature = 1;
    }
    if (metadata.top_p !== undefined) body.top_p = metadata.top_p;
    if (metadata.presence_penalty !== undefined) body.presence_penalty = metadata.presence_penalty;
    if (metadata.frequency_penalty !== undefined) body.frequency_penalty = metadata.frequency_penalty;
  } else {
    body.temperature = metadata.temperature ?? 0.7;
    body.top_p = metadata.top_p ?? 1;
    body.presence_penalty = metadata.presence_penalty ?? 0;
    body.frequency_penalty = metadata.frequency_penalty ?? 0;
    body.max_tokens = completionLimit;
  }

  if (metadata.response_format === "json") {
    body.response_format = { type: "json_object" };
  }

  return body;
}

function parsePromptToMessages(prompt: string): OpenAIChatMessage[] {
  const systemMatch = prompt.match(/^System:\s*([\s\S]*?)(?:\nUser:|$)/i);
  const userMatch = prompt.match(/\nUser:\s*([\s\S]*)$/i);

  if (systemMatch && userMatch) {
    return [
      { role: "system", content: systemMatch[1].trim() },
      { role: "user", content: userMatch[1].trim() },
    ];
  }

  return [{ role: "user", content: prompt.trim() }];
}

function normalizeUsage(usage?: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}): ProviderTokenUsage | undefined {
  if (!usage) return undefined;
  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
  if (totalTokens <= 0) return undefined;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };
}
