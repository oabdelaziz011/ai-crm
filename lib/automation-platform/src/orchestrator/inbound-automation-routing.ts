import type { AutomationRunRecord, ConversationSessionRecord } from "../types.js";
import {
  canResumeWaitingRun,
  isSessionExpired,
  isStaleWaitingRun,
  shouldStartNewConversation,
  buildInboundRoutingEligibility,
  isActivelyExecutingRun,
  isOrphanedActiveRun,
  hasSessionRunStatusMismatch,
  type SessionPolicyConfig,
  DEFAULT_SESSION_POLICY,
} from "./session-policy.js";
import { traceInboundRoutingDecision } from "../debug/inbound-routing-trace-debug.js";

export type InboundAutomationExecutionMode =
  | "resume"
  | "start"
  | "abandon_and_start"
  | "hold_active_session";

export type InboundAutomationRoutingDiagnostics = {
  sessionId: string | null;
  flowId: string | null;
  runId: string | null;
  currentNodeId: string | null;
  waitingInput: string | null;
  sessionStatus: string | null;
  runStatus: string | null;
};

export type InboundAutomationRoutingDecision = {
  mode: InboundAutomationExecutionMode;
  reason: string;
  diagnostics: InboundAutomationRoutingDiagnostics;
};

export function buildInboundAutomationRoutingDiagnostics(input: {
  session: ConversationSessionRecord | null;
  run: AutomationRunRecord | null;
}): InboundAutomationRoutingDiagnostics {
  const waitingFromRun =
    input.run && typeof input.run.variables.__waitingFor === "string" ? input.run.variables.__waitingFor : null;
  const waitingFromSession =
    input.session && typeof input.session.variables.__waitingFor === "string"
      ? input.session.variables.__waitingFor
      : null;

  return {
    sessionId: input.session?.id ?? null,
    flowId: input.session?.flow_id ?? input.run?.flow_id ?? null,
    runId: input.run?.id ?? input.session?.run_id ?? null,
    currentNodeId: input.run?.current_node_id ?? input.session?.current_node_id ?? null,
    waitingInput: waitingFromRun ?? waitingFromSession,
    sessionStatus: input.session?.status ?? null,
    runStatus: input.run?.status ?? null,
  };
}

export function resolveInboundAutomationRoute(input: {
  boundFlowId: string;
  session: ConversationSessionRecord | null;
  run: AutomationRunRecord | null;
  expired?: boolean;
  policy?: SessionPolicyConfig;
  currentNodeType?: string | null;
}): InboundAutomationRoutingDecision {
  const policy = input.policy ?? DEFAULT_SESSION_POLICY;
  const expired = Boolean(input.expired);
  const diagnostics = buildInboundAutomationRoutingDiagnostics({
    session: input.session,
    run: input.run,
  });
  const eligibility = buildInboundRoutingEligibility(input.session, input.run, expired, policy);

  const finalize = (decision: InboundAutomationRoutingDecision): InboundAutomationRoutingDecision => {
    traceInboundRoutingDecision({
      boundFlowId: input.boundFlowId,
      session: input.session,
      run: input.run,
      expired,
      eligibility,
      decision,
      currentNodeType: input.currentNodeType ?? null,
    });
    return decision;
  };

  if (!input.session || expired) {
    return finalize({
      mode: "start",
      reason: expired ? "session_expired" : "no_active_session",
      diagnostics,
    });
  }

  if (input.session.flow_id !== input.boundFlowId) {
    return finalize({
      mode: "start",
      reason: "bound_flow_mismatch",
      diagnostics,
    });
  }

  if (input.run && canResumeWaitingRun(input.session, input.run, policy)) {
    return finalize({
      mode: "resume",
      reason: "waiting_input_with_valid_execution_pins",
      diagnostics,
    });
  }

  if (input.run && isStaleWaitingRun(input.session, input.run, policy)) {
    return finalize({
      mode: "abandon_and_start",
      reason: "stale_waiting_input_missing_execution_pins",
      diagnostics,
    });
  }

  if (
    input.run &&
    (isOrphanedActiveRun(input.session, input.run) || hasSessionRunStatusMismatch(input.session, input.run))
  ) {
    return finalize({
      mode: "abandon_and_start",
      reason: isOrphanedActiveRun(input.session, input.run)
        ? "orphaned_active_run_not_waiting_for_input"
        : "session_run_status_mismatch",
      diagnostics,
    });
  }

  if (shouldStartNewConversation(input.session, input.run, expired)) {
    return finalize({
      mode: "start",
      reason: "prior_session_terminal_or_missing_run",
      diagnostics,
    });
  }

  if (input.run && isActivelyExecutingRun(input.session, input.run)) {
    return finalize({
      mode: "hold_active_session",
      reason: "active_session_executing_recently",
      diagnostics,
    });
  }

  return finalize({
    mode: "hold_active_session",
    reason: "active_session_not_waiting_for_input",
    diagnostics,
  });
}
