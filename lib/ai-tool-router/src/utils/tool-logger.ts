import { isTestRuntime } from "@workspace/platform-crypto/client";

export type ToolLogEvent = {
  event: "tool_selected" | "tool_execution_completed" | "tool_execution_failed";
  conversationId?: string;
  companyId?: string;
  toolKey?: string;
  executionId?: string;
  triggeredBy?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  durationMs?: number;
  status?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
};

const REDACTED_KEYS = ["apiKey", "token", "secret", "password"];

function sanitize(payload: ToolLogEvent): ToolLogEvent {
  const clone = structuredClone(payload) as ToolLogEvent;
  for (const key of ["input", "output"] as const) {
    const value = clone[key];
    if (value && typeof value === "object") {
      for (const field of Object.keys(value)) {
        if (REDACTED_KEYS.some((blocked) => field.toLowerCase().includes(blocked))) {
          delete (value as Record<string, unknown>)[field];
        }
      }
    }
  }
  return clone;
}

export function logToolEvent(payload: ToolLogEvent): void {
  if (isTestRuntime()) return;
  console.info(JSON.stringify(sanitize(payload)));
}
