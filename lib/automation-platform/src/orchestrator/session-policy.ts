import { DEFAULT_SESSION_TIMEOUT_MS } from "../constants.js";
import { readClientEnvFlag } from "@workspace/platform-crypto/client";
import { extractInteractiveSelection, INTERACTIVE_SELECTION_INPUT_KEY } from "../runtime/conversation-variables.js";
import { readLatestOutbound } from "../runtime/outbound-queue.js";
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

export const STALE_WAITING_RUN_REASON =
  "stale_waiting_run: missing execution pin (legacy or corrupted waiting state)";

export function hasValidWaitingRunState(
  session: ConversationSessionRecord,
  run: AutomationRunRecord,
): boolean {
  if (!run.session_id || !run.current_node_id || !run.flow_version_id) return false;
  if (!session.flow_version_id) return false;
  if (run.session_id !== session.id) return false;
  if (session.run_id && session.run_id !== run.id) return false;
  return true;
}

export function canResumeWaitingRun(
  session: ConversationSessionRecord,
  run: AutomationRunRecord | null,
  policy: SessionPolicyConfig = DEFAULT_SESSION_POLICY,
): boolean {
  if (!policy.allowResumeWhileWaiting) return false;
  if (session.status !== "waiting_input") return false;
  if (run?.status !== "waiting_input") return false;
  if (!run) return false;
  return hasValidWaitingRunState(session, run);
}

export function isStaleWaitingRun(
  session: ConversationSessionRecord,
  run: AutomationRunRecord | null,
  policy: SessionPolicyConfig = DEFAULT_SESSION_POLICY,
): boolean {
  if (!policy.allowResumeWhileWaiting) return false;
  if (session.status !== "waiting_input") return false;
  if (run?.status !== "waiting_input") return false;
  if (!run) return false;
  return !hasValidWaitingRunState(session, run);
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

const ACTIVE_EXECUTION_WINDOW_MS = 15_000;

export type InboundRoutingEligibility = {
  canResume: boolean;
  isStaleWaiting: boolean;
  shouldRestart: boolean;
  isActivelyExecuting: boolean;
  isOrphanedActiveRun: boolean;
  hasSessionRunStatusMismatch: boolean;
};

export function isActivelyExecutingRun(
  session: ConversationSessionRecord,
  run: AutomationRunRecord | null,
  now: Date = new Date(),
  activeWindowMs: number = ACTIVE_EXECUTION_WINDOW_MS,
): boolean {
  if (!run) return false;
  if (run.status !== "running") return false;
  if (session.status !== "running" && session.status !== "active") return false;
  // Use run.started_at — session.last_activity_at is refreshed on every inbound touch
  // (inbound-message-pipeline touchInbound) and falsely extends the active window.
  const runStartedAt = new Date(run.started_at).getTime();
  if (!Number.isFinite(runStartedAt)) return false;
  return now.getTime() - runStartedAt <= activeWindowMs;
}

export function hasSessionRunStatusMismatch(
  session: ConversationSessionRecord,
  run: AutomationRunRecord | null,
): boolean {
  if (!run) return false;
  const sessionWaiting = session.status === "waiting_input";
  const runWaiting = run.status === "waiting_input";
  return sessionWaiting !== runWaiting;
}

export function isOrphanedActiveRun(
  session: ConversationSessionRecord,
  run: AutomationRunRecord | null,
  now: Date = new Date(),
  activeWindowMs: number = ACTIVE_EXECUTION_WINDOW_MS,
): boolean {
  if (!run) return false;
  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") return false;
  if (session.status === "completed" || session.status === "expired" || session.status === "cancelled") return false;

  if (run.status === "running" || session.status === "running") {
    return !isActivelyExecutingRun(session, run, now, activeWindowMs);
  }

  if (
    (session.status === "active" || session.status === "paused") &&
    run.status !== "waiting_input"
  ) {
    return true;
  }

  return false;
}

export function buildInboundRoutingEligibility(
  session: ConversationSessionRecord | null,
  run: AutomationRunRecord | null,
  expired: boolean,
  policy: SessionPolicyConfig = DEFAULT_SESSION_POLICY,
  now: Date = new Date(),
): InboundRoutingEligibility {
  return {
    canResume: Boolean(session && run && canResumeWaitingRun(session, run, policy)),
    isStaleWaiting: Boolean(session && run && isStaleWaitingRun(session, run, policy)),
    shouldRestart: shouldStartNewConversation(session, run, expired),
    isActivelyExecuting: Boolean(session && run && isActivelyExecutingRun(session, run, now)),
    isOrphanedActiveRun: Boolean(session && run && isOrphanedActiveRun(session, run, now)),
    hasSessionRunStatusMismatch: Boolean(session && run && hasSessionRunStatusMismatch(session, run)),
  };
}

function isInteractiveReplyPayload(payload: Record<string, unknown>): boolean {
  return payload.kind === "interactive_reply" || typeof payload.replyId === "string";
}

export function buildResumeInput(
  run: AutomationRunRecord,
  inboundText: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const waitingFor = typeof run.variables.__waitingFor === "string" ? run.variables.__waitingFor : "input";
  const input: Record<string, unknown> = { ...payload };

  if (waitingFor === INTERACTIVE_SELECTION_INPUT_KEY) {
    if (isInteractiveReplyPayload(payload)) {
      input.replyId = payload.replyId;
      input.title = typeof payload.title === "string" ? payload.title : inboundText;
      input[INTERACTIVE_SELECTION_INPUT_KEY] =
        typeof payload.replyId === "string" && payload.replyId.trim()
          ? payload.replyId.trim()
          : input.title;
    }

    if (typeof payload.interactionType === "string" && payload.interactionType.trim()) {
      input.interactionType = payload.interactionType;
    }
    if (payload.kind === "interactive_reply") {
      input.kind = payload.kind;
    }

    const outbound = readLatestOutbound(run.variables);
    if (outbound) {
      const kind = outbound.kind;
      if (typeof kind === "string" && kind.trim()) {
        input.outboundKind = kind;
      }
    }
  } else {
    input[waitingFor] = inboundText;
  }

  const selection = extractInteractiveSelection(input);
  if (selection) {
    input.replyId = selection.last_button_id;
    input.title = selection.last_button_title;
  }

  if (readClientEnvFlag("AUTOMATION_IF_TRACE_DEBUG")) {
    void import("../debug/interactive-if-trace-debug.js").then(({ traceBuildResumeInput }) => {
      traceBuildResumeInput({
        runId: run.id,
        waitingFor,
        inboundText,
        payload,
        output: input,
      });
    });
  }

  return input;
}
