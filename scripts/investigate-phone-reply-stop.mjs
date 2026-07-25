/**
 * Map book flow graph after Ask Question + find recent phone-reply runs.
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
const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const VERSION = "51022517-74a8-4179-af4f-83d220e1bbd1";
const ASK_NODE = "04f805f8-085a-4d1e-bcc7-8f9228ee1ff8";

const { data: flow } = await sb.from("automation_flows").select("active_version_id").eq("id", FLOW_ID).single();
const versionId = flow?.active_version_id ?? VERSION;

const { data: nodes } = await sb.from("automation_flow_version_nodes").select("*").eq("flow_version_id", versionId);
const { data: edges } = await sb.from("automation_flow_version_edges").select("*").eq("flow_version_id", versionId);
const nodeById = Object.fromEntries((nodes ?? []).map((n) => [n.id, n]));

const askNode = nodeById[ASK_NODE];
const askOut = (edges ?? []).filter((e) => e.source_node_id === ASK_NODE);
const findCustomerNodes = (nodes ?? []).filter((n) => n.config?.action === "find_customer");

console.log("=== ASK QUESTION NODE ===");
console.log(JSON.stringify({
  id: askNode?.id,
  label: askNode?.label,
  action: askNode?.config?.action,
  inputKey: askNode?.config?.inputKey,
  prompt: askNode?.config?.prompt,
}, null, 2));

console.log("\n=== EDGES FROM ASK QUESTION ===");
for (const e of askOut) {
  const target = nodeById[e.target_node_id];
  console.log(JSON.stringify({
    targetId: e.target_node_id,
    targetLabel: target?.label,
    targetAction: target?.config?.action,
    targetConfig: target?.config,
    condition: e.condition,
  }, null, 2));
}

console.log("\n=== FIND CUSTOMER NODES ===");
for (const n of findCustomerNodes) {
  const out = (edges ?? []).filter((e) => e.source_node_id === n.id);
  console.log(JSON.stringify({
    id: n.id,
    label: n.label,
    config: n.config,
    outgoing: out.map((e) => ({
      target: e.target_node_id,
      targetLabel: nodeById[e.target_node_id]?.label,
      targetAction: nodeById[e.target_node_id]?.config?.action,
      condition: e.condition,
    })),
  }, null, 2));
}

// Recent runs that reached ask node or have customer_phone
const { data: recentRuns } = await sb
  .from("automation_runs")
  .select("id, status, current_node_id, flow_version_id, variables, updated_at, started_at")
  .eq("flow_id", FLOW_ID)
  .order("updated_at", { ascending: false })
  .limit(30);

const phoneRuns = (recentRuns ?? []).filter((r) => {
  const v = r.variables ?? {};
  return (
    v.customer_phone !== undefined ||
    v.phone !== undefined ||
    v.__waitingFor === "customer_phone" ||
    r.current_node_id === ASK_NODE ||
    JSON.stringify(v).includes("customer_phone")
  );
});

console.log("\n=== RECENT RUNS WITH PHONE CONTEXT ===", phoneRuns.length);
for (const r of phoneRuns.slice(0, 8)) {
  console.log(JSON.stringify({
    id: r.id,
    status: r.status,
    current_node_id: r.current_node_id,
    currentLabel: nodeById[r.current_node_id]?.label ?? nodeById[r.current_node_id]?.config?.action,
    __waitingFor: r.variables?.__waitingFor,
    customer_phone: r.variables?.customer_phone,
    phone: r.variables?.phone,
    conversation: r.variables?.conversation,
    lookup: r.variables?.lookup,
    customer: r.variables?.customer,
    updated_at: r.updated_at,
  }, null, 2));
}
