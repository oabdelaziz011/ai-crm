/**
 * Sprint AI.3 production channel config:
 * - Disable workflow binding (preserve row; routes to Enterprise Runtime)
 * - Terminate stuck automation runs for WhatsApp test user
 *
 * WARNING: Disabling the binding forces all inbound WhatsApp messages through AI
 * Runtime fallback. Re-enable via Channels → Configure → "Enable workflow", or:
 *   node scripts/restore-channel-workflow-binding.mjs [companyChannelId]
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTION_CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const ZOMBIE_RUN_IDS = [
  "bdc6e65c-d76b-470b-8638-ed7f52974647",
  "e015ea13-930f-4bb3-ab30-a444383ba2a2",
];
const RECOVERY_REASON = "sprint_ai3_production_readiness: enable Enterprise Runtime AI scheduling path";

const env = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const now = new Date().toISOString();

// 1. Disable workflow binding (do NOT delete — channels can re-enable for intentional workflows)
const { data: bindingBefore } = await sb
  .from("company_channel_automation_bindings")
  .select("id, automation_flow_id, is_enabled")
  .eq("company_channel_id", PRODUCTION_CHANNEL_ID)
  .is("deleted_at", null)
  .maybeSingle();

console.log("Binding before:", bindingBefore);

if (bindingBefore?.is_enabled) {
  const { data: bindingAfter, error } = await sb
    .from("company_channel_automation_bindings")
    .update({
      is_enabled: false,
      updated_at: now,
    })
    .eq("id", bindingBefore.id)
    .select("id, automation_flow_id, is_enabled")
    .single();

  if (error) {
    console.error("Failed to disable binding:", error.message);
    process.exit(1);
  }
  console.log("Binding after (disabled):", bindingAfter);
} else {
  console.log("Binding already disabled or absent — no change");
}

// 2. Terminate zombie/stuck automation runs
for (const runId of ZOMBIE_RUN_IDS) {
  const { data: run } = await sb.from("automation_runs").select("*").eq("id", runId).maybeSingle();
  if (!run) {
    console.log(`Run ${runId} not found — skip`);
    continue;
  }
  if (["completed", "failed", "cancelled"].includes(run.status)) {
    console.log(`Run ${runId} already terminal (${run.status}) — skip`);
    continue;
  }

  const { data: terminated, error: runErr } = await sb
    .from("automation_runs")
    .update({
      status: "cancelled",
      current_node_id: null,
      finished_at: now,
      error_message: RECOVERY_REASON,
      variables: {
        ...(run.variables ?? {}),
        __abandonedReason: RECOVERY_REASON,
        __abandonedAt: now,
        __waitingFor: null,
      },
    })
    .eq("id", runId)
    .select("id, status")
    .single();

  if (runErr) {
    console.error(`Failed to terminate run ${runId}:`, runErr.message);
    continue;
  }
  console.log("Terminated run:", terminated);

  if (run.session_id) {
    await sb
      .from("conversation_sessions")
      .update({
        status: "cancelled",
        run_id: null,
        current_node_id: null,
        flow_version_id: null,
        last_activity_at: now,
        metadata: { sprintAi3RecoveryAt: now, abandonedRunId: runId },
      })
      .eq("id", run.session_id);
    console.log("Cancelled automation session:", run.session_id);
  }
}

// 3. Verify routing config
const { data: activeBinding } = await sb
  .from("company_channel_automation_bindings")
  .select("id, is_enabled, automation_flow_id")
  .eq("company_channel_id", PRODUCTION_CHANNEL_ID)
  .eq("is_enabled", true)
  .is("deleted_at", null)
  .maybeSingle();

const { data: stuckRuns } = await sb
  .from("automation_runs")
  .select("id, status, started_at")
  .in("id", ZOMBIE_RUN_IDS);

console.log("\nVerification:");
console.log(
  JSON.stringify(
    {
      activeWorkflowBinding: activeBinding,
      enterpriseRuntimeAvailable: !activeBinding,
      zombieRuns: stuckRuns,
    },
    null,
    2,
  ),
);

if (activeBinding) {
  console.error("FAIL: workflow binding still enabled");
  process.exit(1);
}

console.log("\nPASS: Production channel configured for Enterprise Runtime");
