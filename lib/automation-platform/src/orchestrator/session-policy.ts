import { DEFAULT_SESSION_TIMEOUT_MS } from "../constants.js";
import { extractInteractiveSelection, INTERACTIVE_SELECTION_INPUT_KEY } from "../runtime/conversation-variables.js";
import type { AutomationRunRecord, ConversationSessionRecord } from "../types.js";

export type SessionPolicyConfig = {
  timeoutMs: number;
  allowResumeWhileWaiting: boolean;
  expireInactiveSessions: boolean;
};

export const DEFAULT_SESSION_POLICY: SessionPolicyConfig = {
  timeoutMs: DEFAULT_SESSION_TIMEOUT_MS,
  allowResumeWhileWaiting: true,
  expireInactiveSessions: true,
};

export function isSessionExpired(
  session: ConversationSessionRecord,
  now: Date = new Date(),
  timeoutMs: number = DEFAULT_SESSION_TIMEOUT_MS,
): boolean {
  const lastActivity = new Date(session.last_activity_at).getTime();
  return now.getTime() - lastActivity > timeoutMs;
}

export function canResumeWaitingRun(
  session: ConversationSessionRecord,
  run: AutomationRunRecord | null,
  policy: SessionPolicyConfig = DEFAULT_SESSION_POLICY,
): boolean {
  if (!policy.allowResumeWhileWaiting) return false;
  if (session.status !== "waiting_input") return false;
  return run?.status === "waiting_input";
}

export function shouldStartNewConversation(
  session: ConversationSessionRecord | null,
  run: AutomationRunRecord | null,
  expired: boolean,
): boolean {
  if (!session || expired) return true;
  if (run?.status === "completed" || run?.status === "failed" || run?.status === "cancelled") return true;
  if (session.status === "completed" || session.status === "expired" || session.status === "cancelled") return true;
  return false;
}

export function buildResumeInput(
  run: AutomationRunRecord,
  inboundText: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const waitingFor = typeof run.variables.__waitingFor === "string" ? run.variables.__waitingFor : "input";
  const input: Record<string, unknown> = {
    [waitingFor]: inboundText,
    ...payload,
  };

  if (payload.kind === "interactive_reply" || typeof payload.replyId === "string") {
    input.replyId = payload.replyId;
    input.title = typeof payload.title === "string" ? payload.title : inboundText;
    if (waitingFor === INTERACTIVE_SELECTION_INPUT_KEY) {
      input[INTERACTIVE_SELECTION_INPUT_KEY] = input.title;
    }
  }

  if (waitingFor === INTERACTIVE_SELECTION_INPUT_KEY) {
    const outbound = run.variables.__outbound;
    if (outbound && typeof outbound === "object" && !Array.isArray(outbound)) {
      const kind = (outbound as { kind?: unknown }).kind;
      if (typeof kind === "string" && kind.trim()) {
        input.outboundKind = kind;
      }
    }
  }

  const selection = extractInteractiveSelection(input);
  if (selection) {
    input.replyId = selection.last_button_id;
    input.title = selection.last_button_title;
  }

  return input;
}
