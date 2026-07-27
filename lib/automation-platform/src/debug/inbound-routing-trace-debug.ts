import { readClientEnvFlag } from "@workspace/platform-crypto/client";
import type { AutomationRunRecord, ConversationSessionRecord } from "../types.js";
import {
  buildInboundRoutingEligibility,
  type InboundRoutingEligibility,
} from "../orchestrator/session-policy.js";
import type { InboundAutomationRoutingDecision } from "../orchestrator/inbound-automation-routing.js";

export function isInboundRoutingTraceEnabled(): boolean {
  return readClientEnvFlag("AUTOMATION_INBOUND_ROUTING_DEBUG");
}

function logInboundRoutingTrace(payload: Record<string, unknown>): void {
  if (!isInboundRoutingTraceEnabled()) return;
  console.info(JSON.stringify({ event: "automation.inbound_routing_trace", ...payload }));
}

function readWaitingInput(source: { variables: Record<string, unknown> } | null | undefined): string | null {
  if (!source) return null;
  return typeof source.variables.__waitingFor === "string" ? source.variables.__waitingFor : null;
}

function readLastOutboundSummary(variables: Record<string, unknown>): Record<string, unknown> {
  const queue = variables.__outboundQueue;
  const latest = variables.__outbound;
  const queueLength = Array.isArray(queue) ? queue.length : 0;
  const latestKind = latest && typeof latest === "object" && !Array.isArray(latest)
    ? (latest as { kind?: unknown }).kind ?? null
    : null;
  const latestText = latest && typeof latest === "object" && !Array.isArray(latest)
    ? (latest as { text?: unknown; title?: unknown }).text ??
      (latest as { title?: unknown }).title ??
      null
    : null;
  return {
    outboundQueueLength: queueLength,
    latestOutboundKind: latestKind,
    latestOutboundPreview: typeof latestText === "string" ? latestText.slice(0, 120) : null,
  };
}

export function traceInboundRoutingDecision(input: {
  boundFlowId: string;
  session: ConversationSessionRecord | null;
  run: AutomationRunRecord | null;
  expired: boolean;
  eligibility: InboundRoutingEligibility;
  decision: InboundAutomationRoutingDecision;
  currentNodeType?: string | null;
}): void {
  const { session, run, eligibility, decision } = input;

  logInboundRoutingTrace({
    stage: "routing_decision",
    executionMode: decision.mode,
    reason: decision.reason,
    boundFlowId: input.boundFlowId,
    expired: input.expired,
    session: session
      ? {
          id: session.id,
          status: session.status,
          flowId: session.flow_id,
          flowVersionId: session.flow_version_id,
          runId: session.run_id,
          currentNodeId: session.current_node_id,
          startedAt: session.started_at,
          lastActivityAt: session.last_activity_at,
          waitingInput: readWaitingInput(session),
          ...readLastOutboundSummary(session.variables),
        }
      : null,
    run: run
      ? {
          id: run.id,
          status: run.status,
          flowId: run.flow_id,
          flowVersionId: run.flow_version_id,
          sessionId: run.session_id,
          currentNodeId: run.current_node_id,
          startedAt: run.started_at,
          finishedAt: run.finished_at,
          waitingInput: readWaitingInput(run),
          ...readLastOutboundSummary(run.variables),
        }
      : null,
    currentNode: input.currentNodeType
      ? {
          id: decision.diagnostics.currentNodeId,
          type: input.currentNodeType,
        }
      : { id: decision.diagnostics.currentNodeId, type: null },
    eligibility,
    diagnostics: decision.diagnostics,
    outboundWillBeProduced:
      decision.mode === "resume" || decision.mode === "start" || decision.mode === "abandon_and_start",
    holdDiscardsInbound: decision.mode === "hold_active_session",
  });
}

export function traceInboundRoutingHoldResult(input: {
  decision: InboundAutomationRoutingDecision;
  runId: string;
  lifecycle?: string;
}): void {
  logInboundRoutingTrace({
    stage: "routing_hold_result",
    executionMode: "hold_active_session",
    reason: input.decision.reason,
    runId: input.runId,
    lifecycle: input.lifecycle ?? null,
    outboundMessageCount: 0,
    hasResponseContent: false,
    explanation:
      "channel-automation-port returned early without calling engine.start/resume; inbound-message-pipeline receives empty outboundMessages",
  });
}
