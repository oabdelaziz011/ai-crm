import { supabase } from "@/lib/supabase";
import {
  isAuthenticatedApiConfigured,
  resolveAuthenticatedApiBase,
} from "@/lib/api-server/normalize-api-base";

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function postPlatformAiApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const base = resolveAuthenticatedApiBase();
  if (!base) {
    throw new Error(
      "VITE_API_SERVER_URL is not configured. Platform AI credentials cannot be resolved in the browser.",
    );
  }

  const response = await fetch(`${base}/platform-ai${path}`, {
    method: "POST",
    headers: await buildAuthHeaders(),
    credentials: "include",
    body: JSON.stringify(body),
  });

  let payload: T & { error?: string; message?: string; code?: string };
  try {
    payload = (await response.json()) as T & { error?: string; message?: string; code?: string };
  } catch {
    throw new Error(`Platform AI API returned non-JSON (${response.status})`);
  }

  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? `Platform AI API failed (${response.status})`);
  }
  return payload;
}

export function assertPlatformAiApiConfigured(): void {
  if (!isAuthenticatedApiConfigured()) {
    throw new Error(
      "VITE_API_SERVER_URL is not configured. Platform-managed AI keys require the API server.",
    );
  }
}

export type PlatformAiChatCompletionRequest = {
  companyId: string;
  providerKey?: string;
  useCase?: "chat" | "tool_calling";
  model?: string;
  messages: Array<Record<string, unknown>>;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  tools?: unknown[];
  conversationId?: string;
  executionId?: string;
  responseFormat?: "json" | "text";
};

export type PlatformAiChatCompletionResponse = {
  text: string;
  model: string;
  providerKey: string;
  finishReason: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  latencyMs: number;
  estimatedCostUsd?: number;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  assistantMessage?: Record<string, unknown>;
};

export type PlatformAiEmbeddingsRequest = {
  companyId: string;
  providerKey?: string;
  model?: string;
  input: string | string[];
};

export type PlatformAiEmbeddingsResponse = {
  vectors: number[][];
  vector: number[] | null;
  dimensions: number;
  model: string;
  providerKey: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  latencyMs: number;
};

export function platformAiChatCompletion(
  body: PlatformAiChatCompletionRequest,
): Promise<PlatformAiChatCompletionResponse> {
  assertPlatformAiApiConfigured();
  return postPlatformAiApi<PlatformAiChatCompletionResponse>("/chat-completion", body);
}

export function platformAiEmbeddings(
  body: PlatformAiEmbeddingsRequest,
): Promise<PlatformAiEmbeddingsResponse> {
  assertPlatformAiApiConfigured();
  return postPlatformAiApi<PlatformAiEmbeddingsResponse>("/embeddings", body);
}

/** True when metadata indicates platform-managed credentials (no browser secret). */
export function metadataNeedsPlatformAiProxy(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata) return false;
  if (metadata.__platformApiProxy === true) return true;
  if (metadata.usesPlatformKey === true) {
    const apiKey =
      typeof metadata.apiKey === "string"
        ? metadata.apiKey
        : typeof metadata.api_key === "string"
          ? metadata.api_key
          : "";
    return !apiKey.trim();
  }
  return false;
}
