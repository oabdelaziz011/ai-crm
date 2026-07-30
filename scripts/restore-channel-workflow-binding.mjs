/**
 * Re-enable a channel workflow binding so inbound messages route through
 * the Workflow Engine instead of AI Runtime fallback.
 *
 * Usage: node scripts/restore-channel-workflow-binding.mjs [companyChannelId]
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const companyChannelId =
  process.argv[2] ?? "e126113b-6d0e-48d3-9296-a46aafe0cc75";

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

const { data: binding, error: loadError } = await sb
  .from("company_channel_automation_bindings")
  .select("id, company_channel_id, automation_flow_id, is_enabled")
  .eq("company_channel_id", companyChannelId)
  .is("deleted_at", null)
  .maybeSingle();

if (loadError) {
  console.error("Failed to load binding:", loadError.message);
  process.exit(1);
}

if (!binding) {
  console.error(`No workflow binding found for channel ${companyChannelId}`);
  process.exit(1);
}

if (binding.is_enabled) {
  console.log("Binding already enabled:", binding);
  process.exit(0);
}

const { data: flow, error: flowError } = await sb
  .from("automation_flows")
  .select("id, name, status")
  .eq("id", binding.automation_flow_id)
  .is("deleted_at", null)
  .maybeSingle();

if (flowError) {
  console.error("Failed to load flow:", flowError.message);
  process.exit(1);
}

if (!flow || flow.status !== "active") {
  console.error(
    `Bound flow is not executable (status=${flow?.status ?? "missing"}). Publish the workflow before re-enabling.`,
  );
  process.exit(1);
}

const now = new Date().toISOString();
const { data: updated, error: updateError } = await sb
  .from("company_channel_automation_bindings")
  .update({ is_enabled: true, updated_at: now })
  .eq("id", binding.id)
  .select("id, company_channel_id, automation_flow_id, is_enabled")
  .single();

if (updateError) {
  console.error("Failed to enable binding:", updateError.message);
  process.exit(1);
}

console.log("Workflow binding restored:", updated);
console.log(`Flow: ${flow.name} (${flow.id})`);
