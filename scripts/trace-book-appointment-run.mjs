/**
 * Deep trace for Book Appointment run 239764a7-3051-4cb8-a5a7-ad988fbb0d2d
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
const RUN_ID = "239764a7-3051-4cb8-a5a7-ad988fbb0d2d";

const { data: run } = await sb.from("automation_runs").select("*").eq("id", RUN_ID).single();
console.log("=== RUN ===");
console.log(JSON.stringify({
  id: run.id,
  status: run.status,
  current_node_id: run.current_node_id,
  flow_version_id: run.flow_version_id,
  variables: run.variables,
}, null, 2));

const { data: nodes } = await sb.from("automation_flow_version_nodes").select("*").eq("flow_version_id", run.flow_version_id);
const { data: edges } = await sb.from("automation_flow_version_edges").select("*").eq("flow_version_id", run.flow_version_id);

const nodeMap = Object.fromEntries((nodes ?? []).map((n) => [n.id, n]));

console.log("\n=== NODES (relevant) ===");
for (const n of nodes ?? []) {
  if (n.type === "condition" || n.config?.action?.includes("send") || n.config?.action === "wait_for_reply") {
    console.log({
      id: n.id,
      type: n.type,
      label: n.label,
      action: n.config?.action,
      mode: n.config?.mode,
      ruleSet: n.config?.ruleSet,
      message: n.config?.message?.slice?.(0, 60),
    });
  }
}

console.log("\n=== EDGES from waiting/buttons node ===");
const waitNode = (nodes ?? []).find((n) => n.config?.action === "send_buttons");
if (waitNode) {
  const out = (edges ?? []).filter((e) => e.source_node_id === waitNode.id);
  console.log("waitNode:", waitNode.id, waitNode.label);
  for (const e of out) {
    console.log({
      target: e.target_node_id,
      targetLabel: nodeMap[e.target_node_id]?.label,
      targetType: nodeMap[e.target_node_id]?.type,
      condition: e.condition,
    });
  }
}

// Find IF nodes and their rules
console.log("\n=== IF/ELSE NODES ===");
for (const n of nodes ?? []) {
  if (n.type === "condition" && n.config?.mode !== "switch") {
    const out = (edges ?? []).filter((e) => e.source_node_id === n.id);
    console.log({
      id: n.id,
      label: n.label,
      ruleSet: n.config?.ruleSet,
      yesTarget: out.find((e) => e.condition?.branch === "yes")?.target_node_id,
      yesLabel: nodeMap[out.find((e) => e.condition?.branch === "yes")?.target_node_id]?.label,
      noTarget: out.find((e) => e.condition?.branch === "no")?.target_node_id,
      noLabel: nodeMap[out.find((e) => e.condition?.branch === "no")?.target_node_id]?.label,
    });
  }
}

// Run events / audit if exists
for (const table of ["automation_run_events", "automation_run_steps", "channel_delivery_events"]) {
  const { data, error } = await sb.from(table).select("*").eq("automation_run_id", RUN_ID).order("created_at", { ascending: true }).limit(20);
  if (!error && data?.length) {
    console.log(`\n=== ${table} ===`);
    console.log(JSON.stringify(data.slice(0, 10), null, 2));
  }
}

// Latest book inbound correlation
const { data: deliveries } = await sb
  .from("channel_delivery_events")
  .select("id, payload, created_at")
  .contains("payload", { metadata: { automationRunId: RUN_ID } })
  .order("created_at", { ascending: true })
  .limit(20);

console.log("\n=== DELIVERIES for run ===");
for (const d of deliveries ?? []) {
  const text = d.payload?.metadata?.outboundPayload?.text ?? d.payload?.text ?? d.payload?.content;
  console.log(d.created_at, text?.slice?.(0, 60));
}
