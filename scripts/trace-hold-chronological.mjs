/**
 * Chronological state-machine replay of resolveInboundAutomationRoute().
 * Reconstructs findActiveSession + last_activity_at at each inbound timestamp.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
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
const BOUND_FLOW = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const TIMEOUT_MS = 30 * 60 * 1000;
const EXEC_WINDOW_MS = 15_000;
const ACTIVE = new Set(["active", "running", "waiting_input", "paused"]);

const wf = (id) =>
  `https://supabase.com/dashboard/project/_/editor`; // placeholder

function readW(v) {
  return typeof v?.__waitingFor === "string" ? v.__waitingFor : null;
}

function hasValidPins(s, r) {
  return (
    r?.session_id &&
    r?.current_node_id &&
    r?.flow_version_id &&
    s?.flow_version_id &&
    r.session_id === s.id &&
    (!s.run_id || s.run_id === r.id)
  );
}

function canResume(s, r) {
  return s?.status === "waiting_input" && r?.status === "waiting_input" && hasValidPins(s, r);
}

function isStale(s, r) {
  return s?.status === "waiting_input" && r?.status === "waiting_input" && !hasValidPins(s, r);
}

function isExpired(s, atMs) {
  return atMs - new Date(s.last_activity_at).getTime() > TIMEOUT_MS;
}

function isActiveExec(s, r, atMs) {
  if (!r || r.status !== "running") return false;
  if (s.status !== "running" && s.status !== "active") return false;
  return atMs - new Date(s.last_activity_at).getTime() <= EXEC_WINDOW_MS;
}

function isOrphaned(s, r, atMs) {
  if (!r) return false;
  if (["completed", "failed", "cancelled"].includes(r.status)) return false;
  if (["completed", "expired", "cancelled"].includes(s.status)) return false;
  if (r.status === "running" || s.status === "running") return !isActiveExec(s, r, atMs);
  if (
    (s.status === "active" || s.status === "paused") &&
    !["waiting_input", "completed", "failed", "cancelled"].includes(r.status)
  ) {
    return true;
  }
  return false;
}

function mismatch(s, r) {
  if (!r) return false;
  return (s.status === "waiting_input") !== (r.status === "waiting_input");
}

function shouldRestart(s, r, expired) {
  if (!s || expired) return true;
  if (["completed", "failed", "cancelled"].includes(r?.status)) return true;
  if (["completed", "expired", "cancelled"].includes(s.status)) return true;
  return false;
}

function evaluate(s, r, expired, atMs) {
  const conditions = [];
  const fin = (mode, reason) => ({ mode, reason, conditions });

  conditions.push({ n: 1, check: "!session || expired", pass: !s || expired, detail: { expired, hasSession: !!s } });
  if (!s || expired) return fin(expired ? "start" : "start", expired ? "session_expired" : "no_active_session");

  conditions.push({
    n: 2,
    check: "flow mismatch",
    pass: s.flow_id !== BOUND_FLOW,
    detail: { sessionFlow: s.flow_id },
  });
  if (s.flow_id !== BOUND_FLOW) return fin("start", "bound_flow_mismatch");

  const resume = r && canResume(s, r);
  conditions.push({
    n: 3,
    check: "canResumeWaitingRun",
    pass: resume,
    detail: {
      sessionStatus: s.status,
      runStatus: r?.status,
      __waitingFor: readW(r?.variables) ?? readW(s.variables),
      hasValidPins: r ? hasValidPins(s, r) : false,
    },
  });
  if (resume) return fin("resume", "waiting_input_with_valid_execution_pins");

  const stale = r && isStale(s, r);
  conditions.push({ n: 4, check: "isStaleWaitingRun", pass: stale, detail: { sessionStatus: s.status, runStatus: r?.status } });
  if (stale) return fin("abandon_and_start", "stale_waiting_input_missing_execution_pins");

  const orphan = r && isOrphaned(s, r, atMs);
  const mm = r && mismatch(s, r);
  conditions.push({
    n: 5,
    check: "orphaned || mismatch",
    pass: orphan || mm,
    detail: {
      orphan,
      mismatch: mm,
      msSinceActivity: atMs - new Date(s.last_activity_at).getTime(),
    },
  });
  if (r && (orphan || mm)) {
    return fin("abandon_and_start", orphan ? "orphaned_active_run_not_waiting_for_input" : "session_run_status_mismatch");
  }

  const restart = shouldRestart(s, r, expired);
  conditions.push({ n: 6, check: "shouldStartNewConversation", pass: restart, detail: { sessionStatus: s.status, runStatus: r?.status } });
  if (restart) return fin("start", "prior_session_terminal_or_missing_run");

  const activeExec = r && isActiveExec(s, r, atMs);
  conditions.push({
    n: 7,
    check: "isActivelyExecutingRun",
    pass: activeExec,
    detail: {
      msSinceActivity: atMs - new Date(s.last_activity_at).getTime(),
      windowMs: EXEC_WINDOW_MS,
    },
  });
  if (activeExec) return fin("hold_active_session", "active_session_executing_recently");

  conditions.push({
    n: 8,
    check: "default",
    pass: true,
    detail: { sessionStatus: s.status, runStatus: r?.status },
  });
  return fin("hold_active_session", "active_session_not_waiting_for_input");
}

function preview(row) {
  const m = row.payload?.message;
  return m?.text?.body ?? m?.interactive?.list_reply?.title ?? m?.interactive?.button_reply?.title ?? null;
}

function findActive(simSessions, atMs) {
  const live = simSessions.filter((s) => ACTIVE.has(s.status) && new Date(s.started_at).getTime() <= atMs);
  live.sort((a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime());
  return live[0] ?? null;
}

function findRun(session, simRuns) {
  if (!session) return null;
  if (session.run_id) return simRuns.find((r) => r.id === session.run_id) ?? null;
  return simRuns.find((r) => r.session_id === session.id) ?? null;
}

function resumeRejection(s, r) {
  if (!s) return "no active session";
  if (!r) return "no linked run";
  if (s.status !== "waiting_input" || r.status !== "waiting_input") {
    return `resume requires both waiting_input; got session=${s.status}, run=${r.status}`;
  }
  if (!hasValidPins(s, r)) return "waiting_input pair but execution pins invalid/missing";
  return null;
}

// Load DB truth for initial/final session shapes
const { data: inbounds } = await sb
  .from("channel_inbound_events")
  .select("*")
  .eq("company_channel_id", CHANNEL_ID)
  .eq("sender_external_id", SENDER)
  .gte("created_at", "2026-07-23T23:50:00Z")
  .lte("created_at", "2026-07-24T05:00:00Z")
  .order("created_at", { ascending: true });

const companyId = inbounds[0].company_id;
const { data: dbSessions } = await sb
  .from("conversation_sessions")
  .select("*")
  .eq("company_id", companyId)
  .eq("external_user_id", SENDER)
  .eq("channel", "whatsapp");

const { data: dbRuns } = await sb
  .from("automation_runs")
  .select("*")
  .eq("company_id", companyId);

const sessionIdSet = new Set(dbSessions.map((s) => s.id));
const dbUserRuns = dbRuns.filter((r) => sessionIdSet.has(r.session_id));

// Seed simulation maps from DB records we know matter
const simSessions = new Map();
const simRuns = new Map();

function ensureSession(db) {
  if (!simSessions.has(db.id)) {
    simSessions.set(db.id, {
      id: db.id,
      flow_id: db.flow_id,
      flow_version_id: db.flow_version_id,
      started_at: db.started_at,
      last_activity_at: db.started_at,
      status: "running",
      run_id: null,
      current_node_id: null,
      variables: {},
    });
  }
  return simSessions.get(db.id);
}

function ensureRun(db) {
  if (!simRuns.has(db.id)) {
    simRuns.set(db.id, {
      id: db.id,
      session_id: db.session_id,
      flow_id: db.flow_id,
      flow_version_id: db.flow_version_id,
      started_at: db.started_at,
      status: "running",
      current_node_id: db.current_node_id,
      variables: db.variables ?? {},
    });
  }
  return simRuns.get(db.id);
}

// Pre-register known sessions/runs at creation time
for (const s of dbSessions) ensureSession(s);
for (const r of dbUserRuns) ensureRun(r);

// Link final known state for dad4f358 / f627b887 (waiting at send_buttons)
const DAD = "dad4f358-d034-4800-8481-64181598fd48";
const F627 = "f627b887-30ce-4c8b-a772-8be95881a49c";
const CC = "cc116ad7-80b8-42c8-aacd-96d6cca51f98";
const FF = "ff904a3a-f827-4eb3-b64d-ca88a6d10efc";
const NODE_BUTTONS = "991d1d70-7ec1-42e0-8cb5-1516a4f387ad";
const NODE_STUCK = "0bf11653-f706-4806-84ff-85ffb30557fa";

const holdReports = [];
const allReports = [];

for (const inbound of inbounds) {
  if (inbound.processing_status === "failed") continue;
  const atMs = new Date(inbound.created_at).getTime();
  const atIso = inbound.created_at;

  // Activate sessions that have started by now (use DB started_at)
  for (const s of dbSessions) {
    const sim = ensureSession(s);
    if (new Date(s.started_at).getTime() <= atMs && sim.status === "pending") sim.status = "running";
  }

  const session = findActive([...simSessions.values()], atMs);
  const run = session ? findRun(session, [...simRuns.values()].filter((r) => new Date(r.started_at).getTime() <= atMs)) : null;
  const expired = session ? isExpired(session, atMs) : false;
  const route = evaluate(session, run, expired, atMs);

  const report = {
    inboundEventId: inbound.id,
    created_at: atIso,
    preview: preview(inbound),
    processing_status: inbound.processing_status,
    session: session
      ? {
          id: session.id,
          status: session.status,
          run_id: session.run_id,
          current_node_id: session.current_node_id,
          last_activity_at: session.last_activity_at,
          __waitingFor: readW(session.variables),
        }
      : null,
    run: run
      ? {
          id: run.id,
          status: run.status,
          session_id: run.session_id,
          current_node_id: run.current_node_id,
          __waitingFor: readW(run.variables),
        }
      : null,
    expired,
    routingMode: route.mode,
    routingReason: route.reason,
    conditionsEvaluated: route.conditions,
    resumeRejectedBecause: route.mode !== "resume" ? resumeRejection(session, run) : null,
    holdSelectedBecause:
      route.mode === "hold_active_session"
        ? route.reason === "active_session_executing_recently"
          ? `isActivelyExecutingRun: session+run in running/active, last_activity ${session?.last_activity_at} within ${EXEC_WINDOW_MS}ms`
          : `default hold: active session (${session?.status}) + run (${run?.status}) not eligible for resume/orphan/restart`
        : null,
  };

  allReports.push(report);
  if (route.mode === "hold_active_session") holdReports.push(report);

  // Apply state transitions based on routing outcome (approximate production effects)
  const touch = (s, r, patch) => {
    if (s) {
      Object.assign(s, patch.session ?? {});
      s.last_activity_at = atIso;
    }
    if (r) Object.assign(r, patch.run ?? {});
  };

  if (route.mode === "hold_active_session") {
    // No engine call — session/run unchanged, last_activity NOT bumped
    continue;
  }

  if (route.mode === "start" || route.mode === "abandon_and_start") {
    if (route.mode === "abandon_and_start" && session && run) {
      session.status = "cancelled";
      run.status = "cancelled";
    }
    // New session dad4f358 created ~04:06:57 after abandon path from cc116ad7
    if (atIso >= "2026-07-24T04:06:54" && atIso < "2026-07-24T04:07:00" && !simSessions.get(DAD)?.run_id) {
      const dad = ensureSession(dbSessions.find((s) => s.id === DAD));
      const f627 = ensureRun(dbUserRuns.find((r) => r.id === F627));
      dad.status = "running";
      dad.run_id = F627;
      dad.flow_version_id = "b63cd72a-7055-46f4-b58a-ce7e998f03c9";
      dad.last_activity_at = atIso;
      f627.status = "running";
      f627.session_id = DAD;
    }
    if (route.reason === "session_expired" || route.reason === "no_active_session") {
      // cc116ad7 creation on first hello
      if (atIso >= "2026-07-24T04:00:55" && atIso < "2026-07-24T04:01:00") {
        const cc = ensureSession(dbSessions.find((s) => s.id === CC));
        const ff = ensureRun(dbUserRuns.find((r) => r.id === FF));
        cc.status = "running";
        cc.run_id = FF;
        cc.current_node_id = NODE_STUCK;
        cc.flow_version_id = "b63cd72a-7055-46f4-b58a-ce7e998f03c9";
        cc.last_activity_at = atIso;
        ff.status = "running";
        ff.session_id = CC;
        ff.current_node_id = NODE_STUCK;
      }
    }
    touch(findActive([...simSessions.values()], atMs), run, { session: { last_activity_at: atIso } });
  }

  if (route.mode === "resume" && session && run) {
    touch(session, run, {
      session: { last_activity_at: atIso, status: "running" },
      run: { status: "running" },
    });
    // After resume completes → back to waiting at buttons node (observed final state)
    session.status = "waiting_input";
    run.status = "waiting_input";
    session.current_node_id = NODE_BUTTONS;
    run.current_node_id = NODE_BUTTONS;
    session.variables = { __waitingFor: "interactive_selection" };
    run.variables = { __waitingFor: "interactive_selection" };
    session.last_activity_at = atIso;
  }

  // cc116ad7 execution window: bump activity on early inbounds until stuck at 04:04:50
  if (session?.id === CC && atIso <= "2026-07-24T04:04:50.216+00:00") {
    session.last_activity_at = atIso;
    session.status = "running";
    if (run) {
      run.status = "running";
      run.current_node_id = NODE_STUCK;
    }
  }
}

console.log(JSON.stringify({ totalInbounds: allReports.length, holdCount: holdReports.length }, null, 2));
console.log("\n========== HOLD_ACTIVE_SESSION EVENTS ==========\n");
for (const h of holdReports) {
  console.log(JSON.stringify(h, null, 2));
  console.log("---");
}

writeFileSync(
  resolve(projectRoot, "scripts/hold-active-session-report.json"),
  JSON.stringify({ holdReports, allReports }, null, 2),
);
console.log("\nWrote scripts/hold-active-session-report.json");
