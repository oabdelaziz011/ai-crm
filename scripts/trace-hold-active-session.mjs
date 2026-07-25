/**
 * Reconstruct resolveInboundAutomationRoute() for each inbound in a time window.
 * Identifies hold_active_session candidates via routing replay + delivery correlation.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const p of [resolve(projectRoot, ".env"), resolve(projectRoot, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const SENDER = "201011404109";
const WINDOW_START = "2026-07-24T04:30:00Z";
const WINDOW_END = "2026-07-24T05:00:00Z";
const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVE_EXECUTION_WINDOW_MS = 15_000;
const ACTIVE_SESSION_STATUSES = new Set(["active", "running", "waiting_input", "paused"]);

function readWaitingFor(record) {
  if (!record?.variables) return null;
  return typeof record.variables.__waitingFor === "string" ? record.variables.__waitingFor : null;
}

function hasValidWaitingRunState(session, run) {
  if (!run?.session_id || !run.current_node_id || !run.flow_version_id) return false;
  if (!session?.flow_version_id) return false;
  if (run.session_id !== session.id) return false;
  if (session.run_id && session.run_id !== run.id) return false;
  return true;
}

function canResumeWaitingRun(session, run) {
  if (!session || !run) return false;
  if (session.status !== "waiting_input") return false;
  if (run.status !== "waiting_input") return false;
  return hasValidWaitingRunState(session, run);
}

function isStaleWaitingRun(session, run) {
  if (!session || !run) return false;
  if (session.status !== "waiting_input") return false;
  if (run.status !== "waiting_input") return false;
  return !hasValidWaitingRunState(session, run);
}

function shouldStartNewConversation(session, run, expired) {
  if (!session || expired) return true;
  if (["completed", "failed", "cancelled"].includes(run?.status)) return true;
  if (["completed", "expired", "cancelled"].includes(session.status)) return true;
  return false;
}

function isActivelyExecutingRun(session, run, nowMs) {
  if (!run || run.status !== "running") return false;
  if (session.status !== "running" && session.status !== "active") return false;
  const lastActivity = new Date(session.last_activity_at).getTime();
  return nowMs - lastActivity <= ACTIVE_EXECUTION_WINDOW_MS;
}

function hasSessionRunStatusMismatch(session, run) {
  if (!run) return false;
  const sessionWaiting = session.status === "waiting_input";
  const runWaiting = run.status === "waiting_input";
  return sessionWaiting !== runWaiting;
}

function isOrphanedActiveRun(session, run, nowMs) {
  if (!run) return false;
  if (["completed", "failed", "cancelled"].includes(run.status)) return false;
  if (["completed", "expired", "cancelled"].includes(session.status)) return false;

  if (run.status === "running" || session.status === "running") {
    return !isActivelyExecutingRun(session, run, nowMs);
  }

  if (
    (session.status === "active" || session.status === "paused") &&
    run.status !== "waiting_input" &&
    !["completed", "failed", "cancelled"].includes(run.status)
  ) {
    return true;
  }

  return false;
}

function isSessionExpired(session, nowMs) {
  const lastActivity = new Date(session.last_activity_at).getTime();
  return nowMs - lastActivity > DEFAULT_SESSION_TIMEOUT_MS;
}

function buildEligibility(session, run, expired, nowMs) {
  return {
    canResume: Boolean(session && run && canResumeWaitingRun(session, run)),
    isStaleWaiting: Boolean(session && run && isStaleWaitingRun(session, run)),
    shouldRestart: shouldStartNewConversation(session, run, expired),
    isActivelyExecuting: Boolean(session && run && isActivelyExecutingRun(session, run, nowMs)),
    isOrphanedActiveRun: Boolean(session && run && isOrphanedActiveRun(session, run, nowMs)),
    hasSessionRunStatusMismatch: Boolean(session && run && hasSessionRunStatusMismatch(session, run)),
  };
}

function evaluateRoutingConditions(boundFlowId, session, run, expired, nowMs) {
  const conditions = [];

  conditions.push({
    order: 1,
    check: "!session || expired",
    passed: !session || expired,
    detail: { hasSession: Boolean(session), expired },
  });
  if (!session || expired) {
    return { mode: "start", reason: expired ? "session_expired" : "no_active_session", conditions };
  }

  conditions.push({
    order: 2,
    check: "session.flow_id !== boundFlowId",
    passed: session.flow_id !== boundFlowId,
    detail: { sessionFlowId: session.flow_id, boundFlowId },
  });
  if (session.flow_id !== boundFlowId) {
    return { mode: "start", reason: "bound_flow_mismatch", conditions };
  }

  const resumeOk = Boolean(run && canResumeWaitingRun(session, run));
  conditions.push({
    order: 3,
    check: "canResumeWaitingRun(session, run)",
    passed: resumeOk,
    detail: {
      sessionStatus: session.status,
      runStatus: run?.status ?? null,
      hasValidWaitingRunState: run ? hasValidWaitingRunState(session, run) : false,
      sessionRunId: session.run_id,
      runSessionId: run?.session_id ?? null,
      sessionCurrentNodeId: session.current_node_id,
      runCurrentNodeId: run?.current_node_id ?? null,
      sessionFlowVersionId: session.flow_version_id,
      runFlowVersionId: run?.flow_version_id ?? null,
    },
  });
  if (resumeOk) {
    return { mode: "resume", reason: "waiting_input_with_valid_execution_pins", conditions };
  }

  const staleOk = Boolean(run && isStaleWaitingRun(session, run));
  conditions.push({
    order: 4,
    check: "isStaleWaitingRun(session, run)",
    passed: staleOk,
    detail: { sessionStatus: session.status, runStatus: run?.status ?? null },
  });
  if (staleOk) {
    return { mode: "abandon_and_start", reason: "stale_waiting_input_missing_execution_pins", conditions };
  }

  const orphaned = Boolean(run && isOrphanedActiveRun(session, run, nowMs));
  const mismatch = Boolean(run && hasSessionRunStatusMismatch(session, run));
  conditions.push({
    order: 5,
    check: "isOrphanedActiveRun || hasSessionRunStatusMismatch",
    passed: orphaned || mismatch,
    detail: {
      isOrphanedActiveRun: orphaned,
      hasSessionRunStatusMismatch: mismatch,
      sessionStatus: session.status,
      runStatus: run?.status ?? null,
      msSinceLastActivity: nowMs - new Date(session.last_activity_at).getTime(),
      activeExecutionWindowMs: ACTIVE_EXECUTION_WINDOW_MS,
    },
  });
  if (run && (orphaned || mismatch)) {
    return {
      mode: "abandon_and_start",
      reason: orphaned ? "orphaned_active_run_not_waiting_for_input" : "session_run_status_mismatch",
      conditions,
    };
  }

  const restart = shouldStartNewConversation(session, run, expired);
  conditions.push({
    order: 6,
    check: "shouldStartNewConversation(session, run, expired)",
    passed: restart,
    detail: { sessionStatus: session.status, runStatus: run?.status ?? null, expired },
  });
  if (restart) {
    return { mode: "start", reason: "prior_session_terminal_or_missing_run", conditions };
  }

  const activelyExecuting = Boolean(run && isActivelyExecutingRun(session, run, nowMs));
  conditions.push({
    order: 7,
    check: "isActivelyExecutingRun(session, run)",
    passed: activelyExecuting,
    detail: {
      sessionStatus: session.status,
      runStatus: run?.status ?? null,
      lastActivityAt: session.last_activity_at,
      msSinceLastActivity: nowMs - new Date(session.last_activity_at).getTime(),
      activeExecutionWindowMs: ACTIVE_EXECUTION_WINDOW_MS,
    },
  });
  if (activelyExecuting) {
    return { mode: "hold_active_session", reason: "active_session_executing_recently", conditions };
  }

  conditions.push({
    order: 8,
    check: "default fallback",
    passed: true,
    detail: {
      sessionStatus: session.status,
      runStatus: run?.status ?? null,
      note: "Active session exists but none of resume/stale/orphan/restart/actively-executing matched",
    },
  });
  return { mode: "hold_active_session", reason: "active_session_not_waiting_for_input", conditions };
}

function snapshotSession(session) {
  if (!session) return null;
  return {
    id: session.id,
    status: session.status,
    flow_id: session.flow_id,
    run_id: session.run_id,
    current_node_id: session.current_node_id,
    flow_version_id: session.flow_version_id,
    last_activity_at: session.last_activity_at,
    started_at: session.started_at,
    __waitingFor: readWaitingFor(session),
  };
}

function snapshotRun(run) {
  if (!run) return null;
  return {
    id: run.id,
    status: run.status,
    session_id: run.session_id,
    current_node_id: run.current_node_id,
    flow_version_id: run.flow_version_id,
    started_at: run.started_at,
    finished_at: run.finished_at,
    __waitingFor: readWaitingFor(run),
  };
}

function extractInboundPreview(row) {
  const msg = row.payload?.message;
  const text =
    msg?.text?.body ??
    msg?.interactive?.list_reply?.title ??
    msg?.interactive?.button_reply?.title ??
    msg?.interactive?.list_reply?.id ??
    msg?.interactive?.button_reply?.id ??
    null;
  return {
    type: msg?.type ?? null,
    text,
    replyId: msg?.interactive?.list_reply?.id ?? msg?.interactive?.button_reply?.id ?? null,
  };
}

/** Point-in-time: session with highest last_activity_at <= T among statuses active at T */
function findActiveSessionAt(sessions, runsById, atMs) {
  const candidates = sessions.filter((s) => {
    const started = new Date(s.started_at).getTime();
    if (started > atMs) return false;
    if (!ACTIVE_SESSION_STATUSES.has(s.status)) return false;
    const lastActivity = new Date(s.last_activity_at).getTime();
    // Session must have been touched before inbound (or exactly at)
    if (lastActivity > atMs + 500) return false;
    return true;
  });

  candidates.sort((a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime());
  const session = candidates[0] ?? null;
  if (!session) return { session: null, run: null };

  let run = null;
  if (session.run_id && runsById.has(session.run_id)) {
    run = runsById.get(session.run_id);
  } else {
    run =
      [...runsById.values()]
        .filter((r) => r.session_id === session.id && new Date(r.started_at).getTime() <= atMs)
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0] ?? null;
  }
  return { session, run };
}

/** Replay: maintain session/run state as inbounds are processed */
function buildReplayState(sessions, runs) {
  const runsById = new Map(runs.map((r) => [r.id, r]));
  const sessionsById = new Map(sessions.map((s) => [s.id, s]));

  // Index run starts and session updates from deliveries correlation (approximate via run started_at)
  return { runsById, sessionsById, sessions, runs };
}

const { data: binding } = await sb
  .from("company_channel_automation_bindings")
  .select("automation_flow_id, is_enabled")
  .eq("company_channel_id", CHANNEL_ID)
  .maybeSingle();

const boundFlowId = binding?.automation_flow_id ?? null;

const { data: inbounds } = await sb
  .from("channel_inbound_events")
  .select("*")
  .eq("company_channel_id", CHANNEL_ID)
  .eq("sender_external_id", SENDER)
  .gte("created_at", WINDOW_START)
  .lte("created_at", WINDOW_END)
  .order("created_at", { ascending: true });

const { data: deliveries } = await sb
  .from("channel_delivery_events")
  .select("id, created_at, delivery_status, metadata")
  .eq("company_channel_id", CHANNEL_ID)
  .gte("created_at", WINDOW_START)
  .lte("created_at", WINDOW_END)
  .order("created_at", { ascending: true });

const deliveryByCorrelation = new Map();
for (const d of deliveries ?? []) {
  const cid = d.metadata?.correlationId;
  if (cid) {
    if (!deliveryByCorrelation.has(cid)) deliveryByCorrelation.set(cid, []);
    deliveryByCorrelation.get(cid).push(d);
  }
}

const companyId = inbounds?.[0]?.company_id;
const { data: sessions } = await sb
  .from("conversation_sessions")
  .select("*")
  .eq("company_id", companyId)
  .eq("channel", "whatsapp")
  .eq("external_user_id", SENDER)
  .order("started_at", { ascending: true });

const { data: runs } = await sb
  .from("automation_runs")
  .select("*")
  .eq("company_id", companyId)
  .order("started_at", { ascending: true });

const sessionIds = new Set((sessions ?? []).map((s) => s.id));
const userRuns = (runs ?? []).filter((r) => sessionIds.has(r.session_id) || (sessions ?? []).some((s) => s.run_id === r.id));

const { runsById, sessions: allSessions } = buildReplayState(sessions ?? [], userRuns);

console.log(JSON.stringify({ boundFlowId, inboundCount: inbounds?.length ?? 0, sessionCount: sessions?.length ?? 0 }, null, 2));
console.log("\n=== HOLD ACTIVE SESSION TRACE ===\n");

const holdEvents = [];

for (const inbound of inbounds ?? []) {
  if (inbound.processing_status === "failed") continue;

  const atMs = new Date(inbound.created_at).getTime();
  const preview = extractInboundPreview(inbound);
  const correlatedDeliveries = deliveryByCorrelation.get(inbound.id) ?? [];
  const hadOutbound = correlatedDeliveries.length > 0;

  const { session, run } = findActiveSessionAt(allSessions, runsById, atMs);
  const expired = session ? isSessionExpired(session, atMs) : false;
  const routing = evaluateRoutingConditions(boundFlowId, session, run, expired, atMs);
  const eligibility = buildEligibility(session, run, expired, atMs);

  const isHold = routing.mode === "hold_active_session";
  const inferredHold = isHold && !hadOutbound;

  const record = {
    inboundEventId: inbound.id,
    created_at: inbound.created_at,
    processing_status: inbound.processing_status,
    preview,
    hadOutboundDelivery: hadOutbound,
    deliveryCount: correlatedDeliveries.length,
    routingMode: routing.mode,
    routingReason: routing.reason,
    expired,
    session: snapshotSession(session),
    run: snapshotRun(run),
    eligibility,
    conditions: routing.conditions,
    resumeRejectedBecause: routing.mode !== "resume" ? summarizeResumeRejection(session, run, routing) : null,
    holdSelectedBecause: isHold ? routing.reason : null,
  };

  if (isHold) holdEvents.push(record);

  console.log(JSON.stringify(record, null, 2));
  console.log("---");
}

console.log("\n=== SUMMARY: hold_active_session events ===");
console.log(JSON.stringify({ count: holdEvents.length, events: holdEvents.map((e) => e.inboundEventId) }, null, 2));

function summarizeResumeRejection(session, run, routing) {
  if (!session) return "no active session";
  if (!run) return "active session but no linked run found at inbound time";
  if (session.status !== "waiting_input" || run.status !== "waiting_input") {
    return `status pair is session=${session.status}, run=${run.status} (resume requires both waiting_input)`;
  }
  if (!hasValidWaitingRunState(session, run)) {
    const issues = [];
    if (!run.session_id) issues.push("run.session_id missing");
    if (!run.current_node_id) issues.push("run.current_node_id missing");
    if (!run.flow_version_id) issues.push("run.flow_version_id missing");
    if (!session.flow_version_id) issues.push("session.flow_version_id missing");
    if (run.session_id !== session.id) issues.push(`run.session_id (${run.session_id}) !== session.id (${session.id})`);
    if (session.run_id && session.run_id !== run.id) issues.push(`session.run_id (${session.run_id}) !== run.id (${run.id})`);
    return `waiting_input but invalid execution pins: ${issues.join("; ")}`;
  }
  return "resume was not evaluated (unexpected)";
}
