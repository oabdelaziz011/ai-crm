#!/usr/bin/env node
/**
 * Simulate inbound automation routing decision for a WhatsApp user.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import {
  createServiceRoleSupabaseClient,
  loadDevScriptEnv,
  resolveArgOrEnv,
  resolveWhatsAppTestRecipient,
} from "./lib/dev-script-env.mjs";

const { env } = loadDevScriptEnv(import.meta.url);
const argv = process.argv.slice(2);
const externalUserId = resolveWhatsAppTestRecipient(argv, env, 0);
const boundFlowId = resolveArgOrEnv(argv, 1, ["FLOW_ID", "AUTOMATION_FLOW_ID"], env, "automation flow id");
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVE_EXECUTION_WINDOW_MS = 15_000;

const sb = createServiceRoleSupabaseClient(env, createClient);

function isSessionExpired(session, now = Date.now()) {
  return now - new Date(session.last_activity_at).getTime() > SESSION_TIMEOUT_MS;
}

function hasValidWaitingRunState(session, run) {
  if (!run.session_id || !run.current_node_id || !run.flow_version_id) return false;
  if (!session.flow_version_id) return false;
  if (run.session_id !== session.id) return false;
  if (session.run_id && session.run_id !== run.id) return false;
  return true;
}

function canResumeWaitingRun(session, run) {
  return (
    session.status === "waiting_input" &&
    run?.status === "waiting_input" &&
    hasValidWaitingRunState(session, run)
  );
}

function isStaleWaitingRun(session, run) {
  return (
    session.status === "waiting_input" &&
    run?.status === "waiting_input" &&
    !hasValidWaitingRunState(session, run)
  );
}

function isActivelyExecutingRun(session, run, now = Date.now()) {
  if (!run || run.status !== "running") return false;
  if (session.status !== "running" && session.status !== "active") return false;
  const runStartedAt = new Date(run.started_at).getTime();
  return now - runStartedAt <= ACTIVE_EXECUTION_WINDOW_MS;
}

function isOrphanedActiveRun(session, run, now = Date.now()) {
  if (!run) return false;
  if (["completed", "failed", "cancelled"].includes(run.status)) return false;
  if (["completed", "expired", "cancelled"].includes(session.status)) return false;
  if (run.status === "running" || session.status === "running") {
    return !isActivelyExecutingRun(session, run, now);
  }
  if ((session.status === "active" || session.status === "paused") && run.status !== "waiting_input") {
    return true;
  }
  return false;
}

function hasSessionRunStatusMismatch(session, run) {
  if (!run) return false;
  return (session.status === "waiting_input") !== (run.status === "waiting_input");
}

function resolveRoute({ session, run, expired }) {
  if (!session || expired) {
    return { mode: "start", reason: expired ? "session_expired" : "no_active_session" };
  }
  if (session.flow_id !== boundFlowId) {
    return { mode: "start", reason: "bound_flow_mismatch" };
  }
  if (run && canResumeWaitingRun(session, run)) {
    return { mode: "resume", reason: "waiting_input_with_valid_execution_pins" };
  }
  if (run && isStaleWaitingRun(session, run)) {
    return { mode: "abandon_and_start", reason: "stale_waiting_input_missing_execution_pins" };
  }
  if (run && (isOrphanedActiveRun(session, run) || hasSessionRunStatusMismatch(session, run))) {
    return {
      mode: "abandon_and_start",
      reason: isOrphanedActiveRun(session, run)
        ? "orphaned_active_run_not_waiting_for_input"
        : "session_run_status_mismatch",
    };
  }
  if (
    run &&
    ["completed", "failed", "cancelled"].includes(run.status) ||
    ["completed", "expired", "cancelled"].includes(session.status)
  ) {
    return { mode: "start", reason: "prior_session_terminal_or_missing_run" };
  }
  if (run && isActivelyExecutingRun(session, run)) {
    return { mode: "hold_active_session", reason: "active_session_executing_recently" };
  }
  return { mode: "hold_active_session", reason: "active_session_not_waiting_for_input" };
}

const { data: sessions } = await sb
  .from("conversation_sessions")
  .select("*")
  .eq("channel", "whatsapp")
  .eq("external_user_id", externalUserId)
  .order("last_activity_at", { ascending: false })
  .limit(15);

const activeSessions = (sessions ?? []).filter((s) =>
  ["active", "running", "waiting_input", "paused"].includes(s.status),
);

const selected = activeSessions[0] ?? null;
let run = null;
if (selected?.run_id) {
  const res = await sb.from("automation_runs").select("*").eq("id", selected.run_id).maybeSingle();
  run = res.data;
} else if (selected) {
  const res = await sb
    .from("automation_runs")
    .select("*")
    .eq("session_id", selected.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  run = res.data;
}

const expired = selected ? isSessionExpired(selected) : false;
const decision = resolveRoute({ session: selected, run, expired });

const sessionSummaries = (sessions ?? []).map((s) => {
  const route = resolveRoute({
    session: s,
    run: null,
    expired: isSessionExpired(s),
  });
  return {
    id: s.id,
    status: s.status,
    lastActivityAt: s.last_activity_at,
    expired: isSessionExpired(s),
    waitingFor: s.variables?.__waitingFor ?? null,
    currentNodeId: s.current_node_id,
    ifSelectedAlone: route,
  };
});

console.log(
  JSON.stringify(
    {
      externalUserId,
      boundFlowId,
      findActiveSessionPicks: selected?.id ?? null,
      selectedSession: selected
        ? {
            id: selected.id,
            status: selected.status,
            lastActivityAt: selected.last_activity_at,
            expired,
            currentNodeId: selected.current_node_id,
            waitingFor: selected.variables?.__waitingFor ?? null,
          }
        : null,
      selectedRun: run
        ? {
            id: run.id,
            status: run.status,
            currentNodeId: run.current_node_id,
            waitingFor: run.variables?.__waitingFor ?? null,
            hasValidPins: hasValidWaitingRunState(selected, run),
            canResume: canResumeWaitingRun(selected, run),
          }
        : null,
      routingDecision: decision,
      allMatchingSessions: sessionSummaries,
    },
    null,
    2,
  ),
);
