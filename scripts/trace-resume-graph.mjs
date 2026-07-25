/**
 * Full resume execution trace for 04:35-04:37 silent inbounds.
 * Uses production DB graph + run state; replays AutomationEngine.resume logic.
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

const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const RUN_ID = "f627b887-30ce-4c8b-a772-8be95881a49c";
const WAITING_NODE = "991d1d70-7ec1-42e0-8cb5-1516a4f387ad";
const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const SENDER = "201011404109";

const INBOUNDS = [
  "890374c7-e0a4-4546-bc22-ed9a7d7de0a0",
  "2b90ec7f-a370-4bc6-b0d6-96128c1fae30",
  "b34d99d3-cb21-4a88-89be-dd55e63addcc",
  "6208c08d-e7df-45e1-b15e-2dd8cd1603c8",
  "8bc5b0a2-4dfb-4e9d-8d07-aad685d9fa10",
  "37d3823f-6c44-4649-8e6b-59c1707d9563",
  "ad0b1961-31a2-46a2-9268-905cff261ec0",
];

// Load run + flow version
const { data: run } = await sb.from("automation_runs").select("*").eq("id", RUN_ID).single();
const versionId = run.flow_version_id;

const { data: version } = await sb.from("automation_flow_versions").select("*").eq("id", versionId).single();
const { data: nodes } = await sb
  .from("automation_flow_version_nodes")
  .select("*")
  .eq("flow_version_id", versionId);
const { data: edges } = await sb
  .from("automation_flow_version_edges")
  .select("*")
  .eq("flow_version_id", versionId);

console.log("=== GRAPH SUMMARY ===");
console.log("version", versionId, "v", version?.version_number);
console.log("nodes", nodes?.length, "edges", edges?.length);

function nodeLabel(id) {
  const n = nodes.find((x) => x.id === id);
  if (!n) return id;
  const action = n.config?.action ?? n.type;
  return `${n.label ?? n.id.slice(0, 8)} [${n.type}/${action}]`;
}

console.log("\n=== EDGES FROM WAITING NODE 991d1d70 ===");
for (const e of edges.filter((x) => x.source_node_id === WAITING_NODE)) {
  console.log(JSON.stringify({ to: nodeLabel(e.target_node_id), condition: e.condition }));
}

// Map full graph paths from waiting node
function outgoing(nodeId) {
  return edges.filter((e) => e.source_node_id === nodeId);
}

function dumpPath(fromId, depth = 0, seen = new Set()) {
  if (depth > 8 || seen.has(fromId)) return;
  seen.add(fromId);
  const n = nodes.find((x) => x.id === fromId);
  const indent = "  ".repeat(depth);
  console.log(`${indent}${nodeLabel(fromId)}`);
  for (const e of outgoing(fromId)) {
    const cond = e.condition?.branch ?? e.condition?.case ?? "default";
    console.log(`${indent}  --[${cond}]-->`);
    dumpPath(e.target_node_id, depth + 2, new Set(seen));
  }
}

console.log("\n=== GRAPH FROM send_buttons (991d1d70) ===");
const fromButtons = edges.filter((e) => e.source_node_id === WAITING_NODE);
for (const e of fromButtons) dumpPath(e.target_node_id, 1);

// Show IF node configs
console.log("\n=== CONDITION NODES ===");
for (const n of nodes.filter((x) => x.type === "condition")) {
  console.log(JSON.stringify({
    id: n.id,
    label: n.label,
    mode: n.config?.mode,
    variable: n.config?.variable,
    ruleSet: n.config?.ruleSet ? "present" : null,
    rules: n.config?.ruleSet?.root?.rules?.slice?.(0, 3),
  }, null, 2));
}

// Load inbound payloads
console.log("\n=== INBOUND PAYLOADS ===");
const { data: inboundRows } = await sb
  .from("channel_inbound_events")
  .select("*")
  .in("id", INBOUNDS)
  .order("created_at", { ascending: true });

for (const row of inboundRows) {
  const msg = row.payload?.message;
  console.log(JSON.stringify({
    id: row.id,
    at: row.created_at,
    type: msg?.type,
    text: msg?.text?.body ?? msg?.interactive?.list_reply?.title ?? msg?.interactive?.button_reply?.title,
    replyId: msg?.interactive?.list_reply?.id ?? msg?.interactive?.button_reply?.id,
    normalized: row.payload?.normalized ?? null,
  }));
}

// Current run variables snapshot
console.log("\n=== CURRENT RUN VARIABLES (post-all-resumes) ===");
console.log(JSON.stringify({
  status: run.status,
  current_node_id: run.current_node_id,
  waitingFor: run.variables?.__waitingFor,
  outboundQueueLen: run.variables?.__outboundQueue?.length ?? 0,
  outboundQueue: run.variables?.__outboundQueue,
  conversation: run.variables?.conversation,
  __branch: run.variables?.__branch,
}, null, 2));

// Deliveries via payload jsonb
const { data: deliveries } = await sb
  .from("channel_delivery_events")
  .select("id, created_at, delivery_status, payload")
  .eq("company_channel_id", CHANNEL_ID)
  .gte("created_at", "2026-07-24T04:35:00Z")
  .lte("created_at", "2026-07-24T04:45:00Z")
  .order("created_at", { ascending: true });

console.log("\n=== DELIVERIES 04:35-04:45 (payload) ===");
for (const d of deliveries ?? []) {
  console.log(JSON.stringify({
    at: d.created_at,
    status: d.delivery_status,
    correlationId: d.payload?.correlationId ?? d.payload?.metadata?.correlationId,
    automationRunId: d.payload?.automationRunId ?? d.payload?.metadata?.automationRunId,
    text: d.payload?.text?.slice?.(0, 60) ?? d.payload?.message?.slice?.(0, 60),
  }));
}
