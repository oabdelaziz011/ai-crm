#!/usr/bin/env node
/**
 * Inspect automation session/run waiting state for resume debugging.
 *
 * Usage:
 *   node scripts/probe-automation-resume-state.mjs [externalUserId]
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import {
  createServiceRoleSupabaseClient,
  loadDevScriptEnv,
  resolveWhatsAppTestRecipient,
} from "./lib/dev-script-env.mjs";

const { env } = loadDevScriptEnv(import.meta.url);
const externalUserId = resolveWhatsAppTestRecipient(process.argv.slice(2), env, 0);
const sb = createServiceRoleSupabaseClient(env, createClient);

function pins(session, run) {
  return {
    sessionId: session?.id ?? null,
    runId: run?.id ?? null,
    sessionStatus: session?.status ?? null,
    runStatus: run?.status ?? null,
    flowId: session?.flow_id ?? run?.flow_id ?? null,
    flowVersionId: session?.flow_version_id ?? run?.flow_version_id ?? null,
    currentNodeId: run?.current_node_id ?? session?.current_node_id ?? null,
    sessionCurrentNodeId: session?.current_node_id ?? null,
    runCurrentNodeId: run?.current_node_id ?? null,
    waitingFor:
      run?.variables?.__waitingFor ??
      session?.variables?.__waitingFor ??
      null,
    sessionRunId: session?.run_id ?? null,
    runSessionId: run?.session_id ?? null,
    hasValidPins: Boolean(
      run?.session_id &&
        run?.current_node_id &&
        run?.flow_version_id &&
        session?.flow_version_id &&
        run.session_id === session?.id &&
        (!session.run_id || session.run_id === run.id),
    ),
  };
}

const sessions = await sb
  .from("conversation_sessions")
  .select("*")
  .eq("channel", "whatsapp")
  .eq("external_user_id", externalUserId)
  .order("last_activity_at", { ascending: false })
  .limit(5);

const runs = await sb
  .from("automation_runs")
  .select("*")
  .eq("trigger_source", "inbound_message")
  .order("started_at", { ascending: false })
  .limit(8);

const activeSession = await sb
  .from("conversation_sessions")
  .select("*")
  .eq("channel", "whatsapp")
  .eq("external_user_id", externalUserId)
  .in("status", ["active", "running", "waiting_input", "paused"])
  .order("last_activity_at", { ascending: false })
  .limit(1)
  .maybeSingle();

let activeRun = null;
if (activeSession.data?.run_id) {
  const res = await sb
    .from("automation_runs")
    .select("*")
    .eq("id", activeSession.data.run_id)
    .maybeSingle();
  activeRun = res.data;
} else if (activeSession.data) {
  const res = await sb
    .from("automation_runs")
    .select("*")
    .eq("session_id", activeSession.data.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  activeRun = res.data;
}

console.log(
  JSON.stringify(
    {
      externalUserId,
      findActiveSession: pins(activeSession.data, activeRun),
      sessionsForRecentRuns: await (async () => {
        const sessionIds = [...new Set((runs.data ?? []).map((r) => r.session_id).filter(Boolean))].slice(0, 5);
        if (sessionIds.length === 0) return [];
        const res = await sb
          .from("conversation_sessions")
          .select("id, external_user_id, status, flow_id, run_id, current_node_id, last_activity_at")
          .in("id", sessionIds);
        return res.data ?? [];
      })(),
      recentSessions: (sessions.data ?? []).map((s) => ({
        ...pins(s, null),
        lastActivityAt: s.last_activity_at,
        startedAt: s.started_at,
      })),
      recentRuns: (runs.data ?? []).map((r) => ({
        id: r.id,
        status: r.status,
        flowId: r.flow_id,
        flowVersionId: r.flow_version_id,
        currentNodeId: r.current_node_id,
        sessionId: r.session_id,
        waitingFor: r.variables?.__waitingFor ?? null,
        startedAt: r.started_at,
        finishedAt: r.finished_at,
      })),
    },
    null,
    2,
  ),
);
