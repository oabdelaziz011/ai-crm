/**
 * Full hold trace with capped last_activity_at (no future timestamps at inbound time).
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
const BOUND = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const TIMEOUT = 30 * 60 * 1000;
const WIN = 15_000;
const ACTIVE = new Set(["active", "running", "waiting_input", "paused"]);

const readW = (v) => (typeof v?.__waitingFor === "string" ? v.__waitingFor : null);
const hasPins = (s, r) =>
  r?.session_id && r?.current_node_id && r?.flow_version_id && s?.flow_version_id && r.session_id === s.id && (!s.run_id || s.run_id === r.id);

function route(s, r, expired, atMs) {
  const c = [];
  const fin = (mode, reason) => ({ mode, reason, conditions: c });
  c.push({ n: 1, check: "!session || expired", pass: !s || expired, detail: { expired } });
  if (!s || expired) return fin("start", expired ? "session_expired" : "no_active_session");
  c.push({ n: 2, check: "flow mismatch", pass: s.flow_id !== BOUND, detail: {} });
  if (s.flow_id !== BOUND) return fin("start", "bound_flow_mismatch");
  const resume = r && s.status === "waiting_input" && r.status === "waiting_input" && hasPins(s, r);
  c.push({ n: 3, check: "canResumeWaitingRun", pass: resume, detail: { sessionStatus: s.status, runStatus: r?.status, __waitingFor: readW(r?.variables) ?? readW(s?.variables), hasPins: r ? hasPins(s, r) : false } });
  if (resume) return fin("resume", "waiting_input_with_valid_execution_pins");
  const stale = r && s.status === "waiting_input" && r.status === "waiting_input" && !hasPins(s, r);
  c.push({ n: 4, check: "isStaleWaitingRun", pass: stale, detail: {} });
  if (stale) return fin("abandon_and_start", "stale_waiting_input_missing_execution_pins");
  const msA = atMs - new Date(s.last_activity_at).getTime();
  const activeExec = r && r.status === "running" && (s.status === "running" || s.status === "active") && msA <= WIN;
  const orphan = r && (r.status === "running" || s.status === "running") && !activeExec && !["completed", "failed", "cancelled"].includes(r.status) && !["completed", "expired", "cancelled"].includes(s.status);
  const mm = r && (s.status === "waiting_input") !== (r.status === "waiting_input");
  c.push({ n: 5, check: "orphaned || mismatch", pass: orphan || mm, detail: { orphan, mm, msSinceActivity: msA } });
  if (r && (orphan || mm)) return fin("abandon_and_start", orphan ? "orphaned_active_run_not_waiting_for_input" : "session_run_status_mismatch");
  const restart = !s || expired || ["completed", "failed", "cancelled"].includes(r?.status) || ["completed", "expired", "cancelled"].includes(s.status);
  c.push({ n: 6, check: "shouldStartNewConversation", pass: restart, detail: {} });
  if (restart) return fin("start", "prior_session_terminal_or_missing_run");
  c.push({ n: 7, check: "isActivelyExecutingRun", pass: activeExec, detail: { msSinceActivity: msA, windowMs: WIN } });
  if (activeExec) return fin("hold_active_session", "active_session_executing_recently");
  c.push({ n: 8, check: "default", pass: true, detail: { sessionStatus: s.status, runStatus: r?.status } });
  return fin("hold_active_session", "active_session_not_waiting_for_input");
}

function capActivity(s, atMs, priorInboundMs) {
  const started = new Date(s.started_at).getTime();
  const dbAct = new Date(s.last_activity_at).getTime();
  // last activity at T cannot exceed T; prefer latest prior inbound that touched automation
  let act = Math.min(dbAct, atMs);
  if (priorInboundMs > 0) act = Math.max(act, priorInboundMs);
  act = Math.max(act, started);
  return new Date(act).toISOString();
}

function findActive(sessions, atMs, priorInboundBySession) {
  const live = sessions
    .filter((s) => ACTIVE.has(s.status) && new Date(s.started_at).getTime() <= atMs)
    .map((s) => ({
      ...s,
      last_activity_at: capActivity(s, atMs, priorInboundBySession.get(s.id) ?? 0),
    }));
  live.sort((a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime());
  return live[0] ?? null;
}

function findRun(session, runs, atMs) {
  if (!session) return null;
  let r = session.run_id ? runs.find((x) => x.id === session.run_id) : null;
  if (!r) r = runs.filter((x) => x.session_id === session.id && new Date(x.started_at).getTime() <= atMs).sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  return r ?? null;
}

const { data: inbounds } = await sb
  .from("channel_inbound_events")
  .select("id, created_at, processing_status, payload, company_id")
  .eq("company_channel_id", CHANNEL_ID)
  .eq("sender_external_id", SENDER)
  .gte("created_at", "2026-07-23T23:50:00Z")
  .lte("created_at", "2026-07-24T05:00:00Z")
  .order("created_at", { ascending: true });

const companyId = inbounds[0].company_id;
const { data: sessions } = await sb.from("conversation_sessions").select("*").eq("company_id", companyId).eq("external_user_id", SENDER).eq("channel", "whatsapp");
const { data: runs } = await sb.from("automation_runs").select("*").eq("company_id", companyId);
const sids = new Set(sessions.map((s) => s.id));
const userRuns = runs.filter((r) => sids.has(r.session_id));

const { data: nodes } = await sb.from("automation_nodes").select("id, node_type, label").in(
  "id",
  [...new Set([...sessions.map((s) => s.current_node_id), ...userRuns.map((r) => r.current_node_id)].filter(Boolean))],
);
const nodeType = new Map(nodes?.map((n) => [n.id, n.node_type]) ?? []);

const priorTouch = new Map(); // sessionId -> last inbound ms that executed automation (not hold)
const holds = [];

for (const inbound of inbounds) {
  if (inbound.processing_status === "failed") continue;
  const atMs = new Date(inbound.created_at).getTime();
  const session = findActive(sessions, atMs, priorTouch);
  const run = findRun(session, userRuns, atMs);
  const expired = session ? atMs - new Date(session.last_activity_at).getTime() > TIMEOUT : false;
  // Recompute expired with capped activity
  const cappedSession = session ? { ...session, last_activity_at: capActivity(session, atMs, priorTouch.get(session.id) ?? 0) } : null;
  const expired2 = cappedSession ? atMs - new Date(cappedSession.last_activity_at).getTime() > TIMEOUT : false;
  const r = route(cappedSession, run, expired2, atMs);

  if (r.mode !== "hold_active_session" && cappedSession) {
    priorTouch.set(cappedSession.id, atMs);
  }

  if (r.mode === "hold_active_session") {
    const preview = inbound.payload?.message?.text?.body ?? inbound.payload?.message?.interactive?.list_reply?.title ?? inbound.payload?.message?.interactive?.button_reply?.title;
    holds.push({
      inboundEventId: inbound.id,
      created_at: inbound.created_at,
      preview,
      sessionStatus: cappedSession?.status,
      runStatus: run?.status,
      last_activity_at: cappedSession?.last_activity_at,
      current_node_id: run?.current_node_id ?? cappedSession?.current_node_id,
      currentNodeType: nodeType.get(run?.current_node_id ?? cappedSession?.current_node_id) ?? null,
      __waitingFor: readW(run?.variables) ?? readW(cappedSession?.variables),
      sessionId: cappedSession?.id,
      runId: run?.id,
      routingReason: r.reason,
      conditionsEvaluated: r.conditions,
      resumeRejectedBecause:
        cappedSession?.status !== "waiting_input" || run?.status !== "waiting_input"
          ? `requires both waiting_input; got session=${cappedSession?.status}, run=${run?.status}`
          : "execution pins invalid",
      holdSelectedBecause:
        r.reason === "active_session_executing_recently"
          ? `Condition 7 passed: isActivelyExecutingRun — ${r.conditions.find((x) => x.n === 7)?.detail?.msSinceActivity}ms since last_activity (window ${WIN}ms)`
          : `Condition 8 default: active session not waiting for input`,
      classification: classify(r, cappedSession, run),
    });
  }
}

function classify(r, s, run) {
  if (r.reason === "active_session_executing_recently") {
    if (s?.status === "running" && run?.status === "running" && !readW(run?.variables)) {
      return "race condition (inbound arrived while prior execution still within 15s window; session never reached waiting_input)";
    }
    return "expected behavior (by design: hold during active execution window)";
  }
  return "stale session state (session stuck non-waiting) or routing logic (default hold fallback)";
}

console.log(JSON.stringify({ holdCount: holds.length, holds }, null, 2));
import { writeFileSync } from "node:fs";
writeFileSync(resolve(projectRoot, "scripts/hold-capped-output.json"), JSON.stringify({ holdCount: holds.length, holds }, null, 2));
