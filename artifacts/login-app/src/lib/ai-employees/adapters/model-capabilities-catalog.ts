import type { AgentRuntimeModelConfig } from "./ai-employee-runtime-types";

const MODEL_PATTERNS: Array<{
  pattern: RegExp;
  config: Omit<AgentRuntimeModelConfig, "model">;
}> = [
  {
    pattern: /gpt-4o/i,
    config: {
      contextWindow: 128_000,
      reasoning: false,
      vision: true,
      functionCalling: true,
      streaming: true,
      maxOutputTokens: 16_384,
    },
  },
  {
    pattern: /gpt-4\.1|gpt-4-turbo/i,
    config: {
      contextWindow: 128_000,
      reasoning: false,
      vision: true,
      functionCalling: true,
      streaming: true,
      maxOutputTokens: 16_384,
    },
  },
  {
    pattern: /gpt-5|o3|o1/i,
    config: {
      contextWindow: 200_000,
      reasoning: true,
      vision: true,
      functionCalling: true,
      streaming: true,
      maxOutputTokens: 32_768,
    },
  },
  {
    pattern: /claude-3|claude-sonnet|claude-opus/i,
    config: {
      contextWindow: 200_000,
      reasoning: true,
      vision: true,
      functionCalling: true,
      streaming: true,
      maxOutputTokens: 8_192,
    },
  },
  {
    pattern: /gemini/i,
    config: {
      contextWindow: 1_000_000,
      reasoning: false,
      vision: true,
      functionCalling: true,
      streaming: true,
      maxOutputTokens: 8_192,
    },
  },
];

const DEFAULT_MODEL_CONFIG: Omit<AgentRuntimeModelConfig, "model"> = {
  contextWindow: 128_000,
  reasoning: false,
  vision: false,
  functionCalling: true,
  streaming: true,
  maxOutputTokens: 8_192,
};

export function resolveModelCapabilities(model: string | null): AgentRuntimeModelConfig {
  if (!model?.trim()) {
    return { model: null, ...DEFAULT_MODEL_CONFIG };
  }

  const matched = MODEL_PATTERNS.find((entry) => entry.pattern.test(model));
  return {
    model,
    ...(matched?.config ?? DEFAULT_MODEL_CONFIG),
  };
}

export function resolveProviderCapabilities(providerKey: string | null): {
  capabilities: string[];
  contextWindow: number | null;
  models: string[];
} {
  const key = providerKey?.toLowerCase() ?? "";

  if (key.includes("openai")) {
    return {
      capabilities: ["chat", "function_calling", "streaming", "vision"],
      contextWindow: 128_000,
      models: ["gpt-4.1", "gpt-4o", "gpt-5"],
    };
  }
  if (key.includes("anthropic")) {
    return {
      capabilities: ["chat", "function_calling", "streaming", "vision", "reasoning"],
      contextWindow: 200_000,
      models: ["claude-sonnet-4", "claude-opus-4"],
    };
  }
  if (key.includes("google") || key.includes("gemini")) {
    return {
      capabilities: ["chat", "function_calling", "streaming", "vision"],
      contextWindow: 1_000_000,
      models: ["gemini-2.0-flash", "gemini-2.5-pro"],
    };
  }

  return {
    capabilities: ["chat", "function_calling", "streaming"],
    contextWindow: 128_000,
    models: [],
  };
}

export function estimatePromptTokens(prompt: string): number {
  const trimmed = prompt.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function extractPromptVariables(prompt: string): string[] {
  const matches = prompt.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g);
  const variables = new Set<string>();
  for (const match of matches) {
    if (match[1]) variables.add(match[1]);
  }
  return [...variables].sort();
}
