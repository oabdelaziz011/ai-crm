import {
  DEFAULT_PROVIDER_MAX_RETRIES,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from "../constants.js";
import { AIProviderConfigurationError, AIProviderRequestError } from "../errors.js";
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
import { resolveProviderApiKey } from "../utils/resolve-api-key.js";

const GEMINI_CONFIGURATION_SCHEMA = {
  type: "object",
  properties: {
    model: { type: "string" },
    apiKey: { type: "string" },
    baseUrl: { type: "string" },
    projectId: { type: "string" },
    timeoutMs: { type: "number" },
    maxRetries: { type: "number" },
  },
  required: ["model"],
} as const;

const DEFAULT_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

type GeminiPart = {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
};

type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

type GeminiTool = {
  functionDeclarations: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  }>;
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: { parts?: GeminiPart[]; role?: string };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { message?: string; code?: number };
};

export type GeminiChatAdapterOptions = {
  fetchFn?: typeof fetch;
};

export function createGeminiChatAdapter(
  configuration: Record<string, unknown>,
  options?: GeminiChatAdapterOptions,
): AIProvider {
  return new GeminiChatAdapter(configuration, options);
}

export class GeminiChatAdapter implements AIProvider {
  readonly key = "gemini";

  constructor(
    private readonly configuration: Record<string, unknown>,
    private readonly options?: GeminiChatAdapterOptions,
  ) {}

  validateConfiguration(configuration: Record<string, unknown>): ConfigurationValidationResult {
    return validateAgainstSchema(GEMINI_CONFIGURATION_SCHEMA, configuration);
  }

  private resolveConfig(inputModel?: string) {
    const validation = this.validateConfiguration(this.configuration);
    if (!validation.valid) {
      throw new AIProviderConfigurationError(validation.errors.join("; "));
    }

    const configuredModel = this.configuration.model;
    const model =
      (typeof inputModel === "string" && inputModel.trim() ? inputModel.trim() : null) ||
      (typeof configuredModel === "string" && configuredModel.trim() ? configuredModel.trim() : null) ||
      DEFAULT_GEMINI_MODEL;

    const baseUrl =
      typeof this.configuration.baseUrl === "string" && this.configuration.baseUrl.trim()
        ? this.configuration.baseUrl.replace(/\/$/, "")
        : DEFAULT_GEMINI_BASE;

    const apiKey = resolveProviderApiKey(this.configuration);
    if (!apiKey) {
      throw new AIProviderConfigurationError(
        "AI provider is not configured by the platform administrator.",
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

    return { model, baseUrl, apiKey, timeoutMs, maxRetries };
  }

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const config = this.resolveConfig(input.model);
    const metadata = input.metadata ?? {};
    const { systemInstruction, contents } = buildGeminiContents(input.prompt, metadata);
    const tools = mapToolsToGemini(metadata.tools);
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: metadata.temperature ?? 0.7,
        topP: metadata.top_p ?? 1,
        maxOutputTokens: metadata.max_tokens ?? metadata.max_completion_tokens ?? 1024,
        ...(metadata.response_format === "json" ? { responseMimeType: "application/json" } : {}),
      },
    };
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }
    if (tools.length > 0 && metadata.toolChoice !== "none") {
      body.tools = [{ functionDeclarations: tools }];
    }

    const url = `${config.baseUrl}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
    const fetchFn = this.options?.fetchFn ?? fetch;
    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      { timeoutMs: config.timeoutMs, maxRetries: config.maxRetries, fetchFn },
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new AIProviderRequestError(
        `Gemini generateContent failed with HTTP ${response.status}: ${errText.slice(0, 400)}`,
      );
    }

    const payload = (await response.json()) as GeminiGenerateResponse;
    if (payload.error?.message) {
      throw new AIProviderRequestError(`Gemini error: ${payload.error.message}`);
    }

    const parts = payload.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
    const toolCalls = parts
      .filter((part) => part.functionCall?.name)
      .map((part, index) => ({
        id: `gemini_tool_${index}_${part.functionCall!.name}`,
        name: part.functionCall!.name,
        arguments: part.functionCall!.args ?? {},
      }));

    return {
      text,
      model: config.model,
      providerKey: this.key,
      mock: false,
      finishReason: payload.candidates?.[0]?.finishReason?.toLowerCase(),
      tokenUsage: normalizeGeminiUsage(payload.usageMetadata),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };
  }

  async classify(input: ClassifyInput): Promise<ClassifyResult> {
    const result = await this.generate({
      prompt: `Classify into one of: ${(input.labels ?? []).join(", ")}\n\nText:\n${input.text}`,
      metadata: { temperature: 0 },
    });
    const label =
      (input.labels ?? []).find((candidate) =>
        result.text.toLowerCase().includes(candidate.toLowerCase()),
      ) ??
      input.labels?.[0] ??
      "general";
    return { label, confidence: 0.5, providerKey: this.key, mock: false };
  }

  async embed(_input: EmbedInput): Promise<EmbedResult> {
    throw new AIProviderConfigurationError("Gemini chat adapter does not implement embeddings.");
  }

  async health(): Promise<HealthResult> {
    const validation = this.validateConfiguration(this.configuration);
    const hasKey = Boolean(resolveProviderApiKey(this.configuration));
    return {
      status: validation.valid && hasKey ? "connected" : "warning",
      providerKey: this.key,
      message:
        validation.valid && hasKey
          ? "Gemini chat adapter is configured."
          : validation.errors.join("; ") || "Missing API key.",
      checkedAt: new Date().toISOString(),
      mock: false,
    };
  }

  async models(): Promise<ModelsResult> {
    const model =
      typeof this.configuration.model === "string" && this.configuration.model.trim()
        ? this.configuration.model.trim()
        : DEFAULT_GEMINI_MODEL;
    return {
      models: [
        {
          id: model,
          displayName: model,
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

function buildGeminiContents(
  prompt: string,
  metadata: GenerateMetadata,
): { systemInstruction: string | null; contents: GeminiContent[] } {
  if (Array.isArray(metadata.chatMessages) && metadata.chatMessages.length > 0) {
    let systemInstruction: string | null = null;
    const contents: GeminiContent[] = [];
    for (const message of metadata.chatMessages) {
      if (message.role === "system" || message.role === "developer") {
        systemInstruction = [systemInstruction, message.content].filter(Boolean).join("\n\n");
        continue;
      }
      if (message.role === "tool") {
        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: message.tool_call_id ?? "tool",
                response: { result: message.content },
              },
            },
          ],
        });
        continue;
      }
      if (message.role === "assistant") {
        const parts: GeminiPart[] = [];
        if (message.content?.trim()) parts.push({ text: message.content });
        for (const call of message.tool_calls ?? []) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(call.function.arguments) as Record<string, unknown>;
          } catch {
            args = {};
          }
          parts.push({ functionCall: { name: call.function.name, args } });
        }
        if (parts.length > 0) contents.push({ role: "model", parts });
        continue;
      }
      contents.push({ role: "user", parts: [{ text: message.content }] });
    }
    if (contents.length === 0) {
      contents.push({ role: "user", parts: [{ text: prompt.trim() || "Hello" }] });
    }
    return { systemInstruction, contents };
  }

  const systemMatch = prompt.match(/^System:\s*([\s\S]*?)(?:\nUser:|$)/i);
  const userMatch = prompt.match(/\nUser:\s*([\s\S]*)$/i);
  if (systemMatch && userMatch) {
    return {
      systemInstruction: systemMatch[1].trim(),
      contents: [{ role: "user", parts: [{ text: userMatch[1].trim() }] }],
    };
  }
  return {
    systemInstruction: null,
    contents: [{ role: "user", parts: [{ text: prompt.trim() || "Hello" }] }],
  };
}

function mapToolsToGemini(tools: unknown[] | undefined): GeminiTool["functionDeclarations"] {
  if (!Array.isArray(tools) || tools.length === 0) return [];
  const declarations: GeminiTool["functionDeclarations"] = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== "object") continue;
    const record = tool as Record<string, unknown>;
    const fn =
      record.type === "function" && record.function && typeof record.function === "object"
        ? (record.function as Record<string, unknown>)
        : record;
    const name = typeof fn.name === "string" ? fn.name : null;
    if (!name) continue;
    declarations.push({
      name,
      ...(typeof fn.description === "string" ? { description: fn.description } : {}),
      ...(fn.parameters && typeof fn.parameters === "object"
        ? { parameters: fn.parameters as Record<string, unknown> }
        : {}),
    });
  }
  return declarations;
}

function normalizeGeminiUsage(usage?: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}): ProviderTokenUsage | undefined {
  if (!usage) return undefined;
  const promptTokens = usage.promptTokenCount ?? 0;
  const completionTokens = usage.candidatesTokenCount ?? 0;
  const totalTokens = usage.totalTokenCount ?? promptTokens + completionTokens;
  if (totalTokens <= 0) return undefined;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    source: "provider",
  };
}
