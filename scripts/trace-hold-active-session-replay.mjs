/**
 * Chronological replay of resolveInboundAutomationRoute() per inbound.
 * Simulates findActiveSession + run lookup as production would at each timestamp.
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
const WINDOW_START = "2026-07-24T04:00:00Z";
const WINDOW_END = "2026-07-24T05:30:00Z";
const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVE_EXECUTION_WINDOW_MS = 15_000;
const ACTIVE_STATUSES = new Set(["active", "running", "waiting_input", "paused"]);

function readWaitingFor(v) {
  return typeof v?.__waitingFor === "string" ? v.__waitingFor : null;
}

function hasValidWaitingRunState(session, run) {
  if (!run?.session_id || !run.current_node_id || !run.flow_version_id) return false;
  if (!session?.flow_version_id) return false;
  if (run.session_id !== session.id) return false;
  if (session.run_id && session.run_id !== run.id) return false;
  return true;
}

function canResumeWaitingRun(session, run) {
  return (
    session?.status === "waiting_input" &&
    run?.status === "waiting_input" &&
    hasValidWaitingRunState(session, run)
  );
}

function isStaleWaitingRun(session, run) {
  return (
    session?.status === "waiting_input" &&
    run?.status === "waiting_input" &&
    !hasValidWaitingRunState(session, run)
  );
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
  return nowMs - new Date(session.last_activity_at).getTime() <= ACTIVE_EXECUTION_WINDOW_MS;
}

function hasSessionRunStatusMismatch(session, run) {
  if (!run) return false;
  return (session.status === "waiting_input") !== (run.status === "waiting_input");
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
    !["waiting_input", "completed", "failed", "cancelled"].includes(run.status)
  ) {
    return true;
  }
  return false;
}

function isSessionExpired(session, nowMs) {
  return nowMs - new Date(session.last_activity_at).getTime() > DEFAULT_SESSION_TIMEOUT_MS;
}

function evaluateRoute(boundFlowId, session, run, expired, nowMs) {
  const conditions = [];
  const push = (order, check, passed, detail) => conditions.push({ order, check, passed, detail });

  push(1, "!session || expired", !session || expired, { hasSession: Boolean(session), expired });
  if (!session || expired) return { mode: "start", reason: expired ? "session_expired" : "no_active_session", conditions };

  push(2, "flow mismatch", session.flow_id !== boundFlowId, { sessionFlowId: session.flow_id, boundFlowId });
  if (session.flow_id !== boundFlowId) return { mode: "start", reason: "bound_flow_mismatch", conditions };

  const resumeOk = Boolean(run && canResumeWaitingRun(session, run));
  push(3, "canResumeWaitingRun", resumeOk, resumeDetail(session, run));
  if (resumeOk) return { mode: "resume", reason: "waiting_input_with_valid_execution_pins", conditions };

  const staleOk = Boolean(run && isStaleWaitingRun(session, run));
  push(4, "isStaleWaitingRun", staleOk, { sessionStatus: session.status, runStatus: run?.status });
  if (staleOk) return { mode: "abandon_and_start", reason: "stale_waiting_input_missing_execution_pins", conditions };

  const orphaned = Boolean(run && isOrphanedActiveRun(session, run, nowMs));
  const mismatch = Boolean(run && hasSessionRunStatusMismatch(session, run));
  push(5, "orphaned || mismatch", orphaned || mismatch, {
    orphaned,
    mismatch,
    msSinceLastActivity: nowMs - new Date(session.last_activity_at).getTime(),
  });
  if (run && (orphaned || mismatch)) {
    return {
      mode: "abandon_and_start",
      reason: orphaned ? "orphaned_active_run_not_waiting_for_input" : "session_run_status_mismatch",
      conditions,
    };
  }

  const restart = shouldStartNewConversation(session, run, expired);
  push(6, "shouldStartNewConversation", restart, { sessionStatus: session.status, runStatus: run?.status, expired });
  if (restart) return { mode: "start", reason: "prior_session_terminal_or_missing_run", conditions };

  const activeExec = Boolean(run && isActivelyExecutingRun(session, run, nowMs));
  push(7, "isActivelyExecutingRun", activeExec, {
    msSinceLastActivity: nowMs - new Date(session.last_activity_at).getTime(),
    windowMs: ACTIVE_EXECUTION_WINDOW_MS,
  });
  if (activeExec) return { mode: "hold_active_session", reason: "active_session_executing_recently", conditions };

  push(8, "default", true, { sessionStatus: session.status, runStatus: run?.status });
  return { mode: "hold_active_session", reason: "active_session_not_waiting_for_input", conditions };
}

function resumeDetail(session, run) {
  return {
    sessionStatus: session?.status,
    runStatus: run?.status,
    hasValidPins: run ? hasValidWaitingRunState(session, run) : false,
    sessionRunId: session?.run_id,
    runSessionId: run?.session_id,
    sessionNode: session?.current_node_id,
    runNode: run?.current_node_id,
    sessionFlowVersion: session?.flow_version_id,
    runFlowVersion: run?.flow_version_id,
  };
}

function resumeRejection(session, run) {
  if (!session) return "no active session";
  if (!run) return "session exists but no run linked";
  if (session.status !== "waiting_input" || run.status !== "waiting_input") {
    return `requires both waiting_input; got session=${session.status}, run=${run.status}`;
  }
  if (!hasValidWaitingRunState(session, run)) {
    const issues = [];
    if (!run.session_id) issues.push("missing run.session_id");
    if (!run.current_node_id) issues.push("missing run.current_node_id");
    if (!run.flow_version_id) issues.push("missing run.flow_version_id");
    if (!session.flow_version_id) issues.push("missing session.flow_version_id");
    if (run.session_id !== session.id) issues.push("run.session_id !== session.id");
    if (session.run_id && session.run_id !== run.id) issues.push("session.run_id !== run.id");
    return `invalid execution pins: ${issues.join(", ")}`;
  }
  return null;
}

function snapSession(s) {
  if (!s) return null;
  return {
    id: s.id,
    status: s.status,
    run_id: s.run_id,
    current_node_id: s.current_node_id,
    last_activity_at: s.last_activity_at,
    __waitingFor: readWaitingFor(s.variables),
  };
}

function snapRun(r) {
  if (!r) return null;
  return {
    id: r.id,
    status: r.status,
    session_id: r.session_id,
    current_node_id: r.current_node_id,
    __waitingFor: readWaitingFor(r.variables),
  };
}

function findActiveSessionLive(sessions, atMs) {
  const live = sessions.filter((s) => {
    if (!ACTIVE_STATUSES.has(s.status)) return false;
    if (new Date(s.started_at).getTime() > atMs) return false;
    return true;
  });
  live.sort((a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime());
  return live[0] ?? null;
}

function findRunForSession(session, runs, atMs) {
  if (!session) return null;
  if (session.run_id) {
    const r = runs.find((x) => x.id === session.run_id);
    if (r && new Date(r.started_at).getTime() <= atMs) return r;
  }
  return (
    runs
      .filter((r) => r.session_id === session.id && new Date(r.started_at).getTime() <= atMs)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0] ?? null
  );
}

function extractPreview(row) {
  const msg = row.payload?.message;
  return {
    type: msg?.type ?? null,
    text:
      msg?.text?.body ??
      msg?.interactive?.list_reply?.title ??
      msg?.interactive?.button_reply?.title ??
      null,
    replyId: msg?.interactive?.list_reply?.id ?? msg?.interactive?.button_reply?.id ?? null,
  };
}

const { data: binding } = await sb
  .from("company_channel_automation_bindings")
  .select("automation_flow_id")
  .eq("company_channel_id", CHANNEL_ID)
  .maybeSingle();
const boundFlowId = binding.automation_flow_id;

const { data: inbounds } = await sb
  .from("channel_inbound_events")
  .select("*")
  .eq("company_channel_id", CHANNEL_ID)
  .eq("sender_external_id", SENDER)
  .gte("created_at", "2026-07-24T04:30:00Z")
  .lte("created_at", "2026-07-24T05:00:00Z")
  .order("created_at", { ascending: true });

const companyId = inbounds[0].company_id;

const { data: sessions } = await sb
  .from("conversation_sessions")
  .select("*")
  .eq("company_id", companyId)
  .eq("channel", "whatsapp")
  .eq("external_user_id", SENDER)
  .order("started_at", { ascending: true });

const sessionIds = new Set(sessions.map((s) => s.id));
const { data: allRuns } = await sb
  .from("automation_runs")
  .select("*")
  .eq("company_id", companyId)
  .order("started_at", { ascending: true });

const runs = allRuns.filter((r) => sessionIds.has(r.session_id) || sessions.some((s) => s.run_id === r.id));

const { data: deliveries } = await sb
  .from("channel_delivery_events")
  .select("id, created_at, metadata, delivery_status")
  .eq("company_channel_id", CHANNEL_ID)
  .gte("created_at", WINDOW_START)
  .lte("created_at", WINDOW_END);

const deliveryByCorr = new Map();
for (const d of deliveries ?? []) {
  const c = d.metadata?.correlationId;
  if (!c) continue;
  if (!deliveryByCorr.has(c)) deliveryByCorr.set(c, []);
  deliveryByCorr.get(c).push(d);
}

// Also search wider window for ad0b1961 delivery
const { data: deliveryForRef } = await sb
  .from("channel_delivery_events")
  .select("id, created_at, metadata")
  .eq("company_channel_id", CHANNEL_ID)
  .contains("metadata", { correlationId: "ad0b1961-31a2-46a2-9268-905cff261ec0" });

console.log("=== SESSIONS IN WINDOW (by last_activity) ===");
for (const s of [...sessions].sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at)).slice(0, 8)) {
  console.log(
    JSON.stringify({
      id: s.id,
      status: s.status,
      run_id: s.run_id,
      started_at: s.started_at,
      last_activity_at: s.last_activity_at,
      waitingFor: readWaitingFor(s.variables),
    }),
  );
}

console.log("\n=== RUNS STARTED 04:30-05:00 ===");
for (const r of runs.filter((r) => r.started_at >= "2026-07-24T04:30:00Z" && r.started_at <= "2026-07-24T05:00:00Z")) {
  console.log(
    JSON.stringify({
      id: r.id,
      session_id: r.session_id,
      status: r.status,
      started_at: r.started_at,
      current_node_id: r.current_node_id,
      waitingFor: readWaitingFor(r.variables),
    }),
  );
}

console.log("\n=== REF DELIVERY LOOKUP ===");
console.log(JSON.stringify(deliveryForRef, null, 2));

console.log("\n=== PER-INBOUND ROUTING (live findActiveSession at timestamp) ===\n");

const holdEvents = [];

for (const inbound of inbounds) {
  if (inbound.processing_status === "failed") continue;
  const atMs = new Date(inbound.created_at).getTime();
  const session = findActiveSessionLive(sessions, atMs);
  const run = findRunForSession(session, runs, atMs);
  const expired = session ? isSessionExpired(session, atMs) : false;
  const route = evaluateRoute(boundFlowId, session, run, expired, atMs);
  const deliveriesForInbound = deliveryByCorr.get(inbound.id) ?? [];

  const record = {
    inboundEventId: inbound.id,
    created_at: inbound.created_at,
    preview: extractPreview(inbound),
    processing_status: inbound.processing_status,
    outboundDeliveries: deliveriesForInbound.length,
    session: snapSession(session),
    run: snapRun(run),
    expired,
    routing: { mode: route.mode, reason: route.reason },
    eligibility: {
      canResume: Boolean(session && run && canResumeWaitingRun(session, run)),
      isStaleWaiting: Boolean(session && run && isStaleWaitingRun(session, run)),
      isOrphanedActiveRun: Boolean(session && run && isOrphanedActiveRun(session, run, atMs)),
      hasSessionRunStatusMismatch: Boolean(session && run && hasSessionRunStatusMismatch(session, run)),
      isActivelyExecuting: Boolean(session && run && isActivelyExecutingRun(session, run, atMs)),
      shouldRestart: shouldStartNewConversation(session, run, expired),
    },
    conditionsEvaluated: route.conditions,
    resumeRejectedBecause: route.mode !== "resume" ? resumeRejection(session, run) : null,
    holdSelectedBecause:
      route.mode === "hold_active_session"
        ? route.reason === "active_session_executing_recently"
          ? `session+run running/active with last_activity ${session?.last_activity_at} within 15s window`
          : `active non-waiting session (session=${session?.status}, run=${run?.status}) after all resume/orphan/restart checks failed`
        : null,
  };

  if (route.mode === "hold_active_session") holdEvents.push(record);
  console.log(JSON.stringify(record, null, 2));
  console.log("---");
}

console.log("\n=== HOLD EVENT COUNT ===", holdEvents.length);

// Broader search: all inbounds in 24h that would route to hold with CURRENT session state at their time
// using sessions that existed at that moment
const { data: inbounds24h } = await sb
  .from("channel_inbound_events")
  .select("id, created_at, processing_status, payload")
  .eq("company_channel_id", CHANNEL_ID)
  .eq("sender_external_id", SENDER)
  .gte("created_at", "2026-07-23T04:00:00Z")
  .lte("created_at", "2026-07-24T05:30:00Z")
  .eq("processing_status", "processed")
  .order("created_at", { ascending: true });

let hold24 = 0;
for (const inbound of inbounds24h ?? []) {
  const atMs = new Date(inbound.created_at).getTime();
  const session = findActiveSessionLive(sessions, atMs);
  const run = findRunForSession(session, runs, atMs);
  const expired = session ? isSessionExpired(session, atMs) : false;
  const route = evaluateRoute(boundFlowId, session, run, expired, atMs);
  if (route.mode === "hold_active_session") {
    hold24++;
    const d = deliveryByCorr.get(inbound.id) ?? [];
    if (hold24 <= 20) {
      console.log(
        JSON.stringify({
          id: inbound.id,
          at: inbound.created_at,
          reason: route.reason,
          text: extractPreview(inbound).text,
          deliveries: d.length,
          sessionStatus: session?.status,
          runStatus: run?.status,
        }),
      );
    }
  }
}
console.log("\n=== HOLD IN 24H (replay) ===", hold24);
