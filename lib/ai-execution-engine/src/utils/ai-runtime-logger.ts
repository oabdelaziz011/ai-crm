import { isTestRuntime } from "@workspace/platform-crypto/client";

export type AIRuntimeLogEvent = {
  event:
    | "ai_runtime_request_started"
    | "ai_runtime_openai_request"
    | "ai_runtime_model_response_received"
    | "ai_runtime_execution_completed"
    | "ai_runtime_execution_failed";
  correlationId?: string;
  companyId?: string;
  conversationId?: string;
  executionId?: string;
  sessionId?: string;
  providerKey?: string;
  model?: string;
  promptBuildId?: string | null;
  messages?: string;
  tools?: string;
  responseFormat?: "text" | "json";
  rawModelResponse?: string;
  normalizedResponse?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  gatewayLatencyMs?: number;
  streaming?: boolean;
  cacheHit?: boolean;
  errorMessage?: string;
};

const REDACTED_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{10,}/g,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /"apiKey"\s*:\s*"[^"]+"/gi,
  /"api_key"\s*:\s*"[^"]+"/gi,
];

function maskSecrets(value: string): string {
  let masked = value;
  for (const pattern of REDACTED_VALUE_PATTERNS) {
    masked = masked.replace(pattern, "[REDACTED]");
  }
  return masked;
}

function sanitizeLogPayload(payload: AIRuntimeLogEvent): AIRuntimeLogEvent {
  const clone = { ...payload } as Record<string, unknown>;
  for (const [key, value] of Object.entries(clone)) {
    if (typeof value === "string") {
      clone[key] = maskSecrets(value);
    }
  }
  return clone as AIRuntimeLogEvent;
}

export function createAIRuntimeLogEvent(
  event: AIRuntimeLogEvent["event"],
  details: Omit<AIRuntimeLogEvent, "event"> = {},
): AIRuntimeLogEvent {
  return sanitizeLogPayload({ event, ...details });
}

export function serializeAIRuntimeLog(payload: AIRuntimeLogEvent): string {
  return JSON.stringify(sanitizeLogPayload(payload));
}

export function logAIRuntimeEvent(payload: AIRuntimeLogEvent): void {
  if (isTestRuntime()) return;
  console.info(serializeAIRuntimeLog(payload));
}
