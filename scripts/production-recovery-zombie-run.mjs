/**
 * Production recovery: terminate zombie run + reset channel session for manual WhatsApp retest.
 * No synthetic tests, no replay.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ZOMBIE_RUN_ID = "e015ea13-930f-4bb3-ab30-a444383ba2a2";
const CHANNEL_SESSION_ID = "4c43b25c-84e8-45bb-9ab5-a6297bcaa859";
const CONVERSATION_ID = "a35d7fff-cac7-47f3-9604-df683e726b71";
const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const V12_ID = "018d469b-b996-430c-baa2-e31bdf7b7c86";
const EXTERNAL_USER_ID = "201023169075";
const RECOVERY_REASON = "production_recovery: zombie run terminated for clean manual WhatsApp retest";

const env = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const now = new Date().toISOString();

function isZombieRun(run) {
  return (
    run.status === "running" &&
    (run.variables?.__waitingFor === null ||
      run.variables?.__waitingFor === undefined ||
      run.variables?.__waitingFor === "")
  );
}

async function snapshot(label) {
  console.log(`\n--- ${label} ---`);
  const { data: run } = await sb.from("automation_runs").select("*").eq("id", ZOMBIE_RUN_ID).maybeSingle();
  const { data: chSession } = await sb.from("channel_sessions").select("*").eq("id", CHANNEL_SESSION_ID).maybeSingle();
  const { data: autoSessions } = await sb
    .from("conversation_sessions")
    .select("*")
    .eq("external_user_id", EXTERNAL_USER_ID)
    .order("last_activity_at", { ascending: false });
  const sessionIds = (autoSessions ?? []).map((s) => s.id);
  let runs = [];
  if (sessionIds.length) {
    const { data } = await sb.from("automation_runs").select("*").in("session_id", sessionIds);
    runs = data ?? [];
  }
  const { data: flow } = await sb.from("automation_flows").select("id,active_version_id,name").eq("id", FLOW_ID).single();
  const zombies = runs.filter(isZombieRun);
  console.log(
    JSON.stringify(
      {
        zombieRun: run
          ? { id: run.id, status: run.status, session_id: run.session_id, current_node_id: run.current_node_id, flow_version_id: run.flow_version_id, __waitingFor: run.variables?.__waitingFor }
          : null,
        channelSession: chSession
          ? { id: chSession.id, session_status: chSession.session_status, conversation_id: chSession.conversation_id }
          : null,
        automationSessions: (autoSessions ?? []).map((s) => ({
          id: s.id,
          status: s.status,
          run_id: s.run_id,
          flow_version_id: s.flow_version_id,
        })),
        zombieRuns: zombies.map((r) => ({ id: r.id, status: r.status, __waitingFor: r.variables?.__waitingFor, current_node_id: r.current_node_id })),
        activeFlowVersion: flow?.active_version_id,
      },
      null,
      2,
    ),
  );
  return { run, chSession, autoSessions, runs, flow, zombies };
}

console.log("=== PRODUCTION RECOVERY START ===");
console.log("Time:", now);

await snapshot("BEFORE");

const { data: zombieRun, error: runFetchErr } = await sb
  .from("automation_runs")
  .select("*")
  .eq("id", ZOMBIE_RUN_ID)
  .single();

if (runFetchErr || !zombieRun) {
  console.error("Zombie run not found:", runFetchErr?.message);
  process.exit(1);
}

const automationSessionId = zombieRun.session_id;

// 1. Terminate zombie automation run
const { data: terminatedRun, error: runErr } = await sb
  .from("automation_runs")
  .update({
    status: "cancelled",
    current_node_id: null,
    finished_at: now,
    error_message: RECOVERY_REASON,
    variables: {
      ...(zombieRun.variables ?? {}),
      __abandonedReason: RECOVERY_REASON,
      __abandonedAt: now,
      __waitingFor: null,
    },
  })
  .eq("id", ZOMBIE_RUN_ID)
  .select("*")
  .single();

if (runErr) {
  console.error("Failed to terminate run:", runErr);
  process.exit(1);
}
console.log("\n✓ Run terminated:", terminatedRun.id, "→", terminatedRun.status);

// 2. Cancel linked automation conversation_session
if (automationSessionId) {
  const { data: terminatedSession, error: sessErr } = await sb
    .from("conversation_sessions")
    .update({
      status: "cancelled",
      run_id: null,
      current_node_id: null,
      flow_version_id: null,
      last_activity_at: now,
      variables: {},
      metadata: {
        productionRecoveryAt: now,
        abandonedRunId: ZOMBIE_RUN_ID,
        reason: RECOVERY_REASON,
      },
    })
    .eq("id", automationSessionId)
    .select("*")
    .single();

  if (sessErr) {
    console.error("Failed to cancel automation session:", sessErr);
    process.exit(1);
  }
  console.log("✓ Automation session cancelled:", terminatedSession.id);
}

// Cancel any other active automation sessions for this WhatsApp user
const { data: otherSessions } = await sb
  .from("conversation_sessions")
  .select("id, status")
  .eq("external_user_id", EXTERNAL_USER_ID)
  .in("status", ["active", "running", "waiting_input", "paused"]);

for (const s of otherSessions ?? []) {
  if (s.id === automationSessionId) continue;
  await sb
    .from("conversation_sessions")
    .update({
      status: "cancelled",
      run_id: null,
      current_node_id: null,
      flow_version_id: null,
      last_activity_at: now,
      variables: {},
      metadata: { productionRecoveryAt: now, reason: RECOVERY_REASON },
    })
    .eq("id", s.id);
  console.log("✓ Extra automation session cancelled:", s.id);
}

// Terminate any other zombie runs for this user
const { data: allUserSessions } = await sb
  .from("conversation_sessions")
  .select("id")
  .eq("external_user_id", EXTERNAL_USER_ID);

const allSessionIds = (allUserSessions ?? []).map((s) => s.id);
if (allSessionIds.length) {
  const { data: activeRuns } = await sb
    .from("automation_runs")
    .select("*")
    .in("session_id", allSessionIds)
    .in("status", ["running", "waiting_input", "queued", "pending"]);

  for (const r of activeRuns ?? []) {
    if (r.id === ZOMBIE_RUN_ID) continue;
    if (r.status === "waiting_input" && r.variables?.__waitingFor) continue;
    await sb
      .from("automation_runs")
      .update({
        status: "cancelled",
        current_node_id: null,
        finished_at: now,
        error_message: RECOVERY_REASON,
      })
      .eq("id", r.id);
    console.log("✓ Additional run terminated:", r.id);
  }
}

// 3. Reset channel session (keep conversation binding, clear execution poison)
const { data: chSession, error: chErr } = await sb
  .from("channel_sessions")
  .select("*")
  .eq("id", CHANNEL_SESSION_ID)
  .single();

if (chErr || !chSession) {
  console.error("Channel session not found:", chErr?.message);
  process.exit(1);
}

if (chSession.conversation_id !== CONVERSATION_ID) {
  console.warn("WARN: channel session conversation_id mismatch", chSession.conversation_id, "expected", CONVERSATION_ID);
}

const { data: resetChannel, error: resetErr } = await sb
  .from("channel_sessions")
  .update({
    session_status: "active",
    metadata: {
      ...(chSession.metadata ?? {}),
      productionRecoveryAt: now,
      previousZombieRunId: ZOMBIE_RUN_ID,
      readyForFreshAutomation: true,
    },
    updated_at: now,
  })
  .eq("id", CHANNEL_SESSION_ID)
  .select("*")
  .single();

if (resetErr) {
  console.error("Failed to reset channel session:", resetErr);
  process.exit(1);
}
console.log("✓ Channel session reset:", resetChannel.id, "status:", resetChannel.session_status);

// 4. Verify + confirm v12 routing
const after = await snapshot("AFTER");

const { data: flow } = await sb.from("automation_flows").select("*").eq("id", FLOW_ID).single();
const v12Ok = flow?.active_version_id === V12_ID;

let readyz = null;
try {
  const res = await fetch("https://webhook.valueor.org/api/readyz");
  readyz = await res.json();
} catch (e) {
  readyz = { error: e.message };
}

// Simulate routing decision (mirrors resolveInboundAutomationRoute logic)
const activeSession = (after.autoSessions ?? []).find((s) =>
  ["active", "running", "waiting_input", "paused"].includes(s.status),
);
const activeRun = activeSession?.run_id
  ? (after.runs ?? []).find((r) => r.id === activeSession.run_id)
  : null;

const nextInboundMode =
  !activeSession || after.zombies.length === 0
    ? activeSession
      ? "resume_or_hold"
      : "start"
    : "blocked";

console.log("\n=== VERIFICATION ===");
console.log("Zombie runs remaining:", after.zombies.length, after.zombies.length === 0 ? "PASS" : "FAIL");
console.log("Active automation session:", activeSession?.id ?? "none (good — fresh start)");
console.log("Active flow active_version_id:", flow?.active_version_id, v12Ok ? "PASS (v12)" : "FAIL");
console.log("Channel session conversation:", resetChannel.conversation_id);
console.log("Webhook readyz customerService:", readyz?.webhookRuntime?.customerService ?? readyz);
console.log(
  JSON.stringify(
    {
      verdict: after.zombies.length === 0 && v12Ok ? "READY_FOR_MANUAL_TEST" : "NEEDS_ATTENTION",
      nextInboundExpected: {
        mode: activeSession ? nextInboundMode : "start",
        pinnedVersionId: V12_ID,
        reason: activeSession
          ? "unexpected active session still present"
          : "no active automation session — engine.start will pin active_version_id (v12)",
      },
      readyForManualWhatsAppTest: after.zombies.length === 0 && v12Ok,
    },
    null,
    2,
  ),
);

if (after.zombies.length > 0 || !v12Ok) {
  process.exit(1);
}

console.log("\n=== READY — send your manual WhatsApp test when ready ===");
