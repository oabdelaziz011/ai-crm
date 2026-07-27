import { isTestRuntime } from "@workspace/platform-crypto/client";

export type AIProviderLogEvent = {
  event:
    | "ai_request_started"
    | "ai_prompt_sent"
    | "ai_response_completed"
    | "ai_request_failed";
  correlationId?: string;
  companyId?: string;
  conversationId?: string;
  executionId?: string;
  providerKey?: string;
  model?: string;
  promptLength?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  streaming?: boolean;
  mock?: boolean;
  errorMessage?: string;
};

const REDACTED_KEYS = ["apiKey", "token", "secret", "password", "authorization", "prompt"];

function sanitizeLogPayload(payload: AIProviderLogEvent): AIProviderLogEvent {
  const clone = { ...payload } as Record<string, unknown>;
  for (const key of Object.keys(clone)) {
    if (REDACTED_KEYS.some((blocked) => key.toLowerCase().includes(blocked))) {
      delete clone[key];
    }
  }
  return clone as AIProviderLogEvent;
}

export function createAIProviderLogEvent(
  event: AIProviderLogEvent["event"],
  details: Omit<AIProviderLogEvent, "event"> = {},
): AIProviderLogEvent {
  return sanitizeLogPayload({ event, ...details });
}

export function serializeAIProviderLog(payload: AIProviderLogEvent): string {
  return JSON.stringify(sanitizeLogPayload(payload));
}

export function logAIProviderEvent(payload: AIProviderLogEvent): void {
  if (isTestRuntime()) return;
  console.info(serializeAIProviderLog(payload));
}
