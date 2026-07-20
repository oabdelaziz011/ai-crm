import { DEFAULT_SESSION_TIMEOUT_MS } from "../constants.js";
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
  return {
    [waitingFor]: inboundText,
    ...payload,
  };
}
