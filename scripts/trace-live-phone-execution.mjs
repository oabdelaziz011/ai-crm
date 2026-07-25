/**
 * Trace live execution from phone message 01023169075 at 2026-07-25T00:31:04
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET_MSG_ID = "97cbb79c-7d81-4212-a77a-6eccab29c0fa";
const TARGET_WAMID = "wamid.HBgMMjAxMDIzMTY5MDc1FQIAEhgUM0FCN0I0RUE3QzlDNERCQjIxNjMA";
const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";

const env = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: phoneMsg } = await sb.from("conversation_messages").select("*").eq("id", TARGET_MSG_ID).single();
console.log("Phone message:", phoneMsg?.id, phoneMsg?.created_at, phoneMsg?.conversation_id);

const conversationId = phoneMsg?.conversation_id;
const { data: conversation } = conversationId
  ? await sb.from("conversations").select("*").eq("id", conversationId).single()
  : { data: null };

console.log("Conversation:", conversation?.id, conversation?.external_thread_id);

// All messages in this conversation around the test
const { data: convMessages } = conversationId
  ? await sb.from("conversation_messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true })
  : { data: [] };

console.log(`\n=== Conversation messages (${convMessages?.length}) ===`);
for (const m of convMessages ?? []) {
  const dir = m.direction ?? m.role ?? "?";
  const content = typeof m.content === "string" ? m.content.slice(0, 100) : JSON.stringify(m.content).slice(0, 100);
  console.log(`${m.created_at} | ${dir} | ${content}`);
}

// Find session by conversation or external thread
let sessions = [];
if (conversationId) {
  const { data } = await sb.from("conversation_sessions").select("*").eq("conversation_id", conversationId).order("started_at", { ascending: false });
  sessions = data ?? [];
}
if (!sessions.length && conversation?.external_thread_id) {
  const { data } = await sb.from("conversation_sessions").select("*").eq("external_thread_id", conversation.external_thread_id).order("started_at", { ascending: false });
  sessions = data ?? [];
}

console.log(`\n=== Sessions (${sessions.length}) ===`);
for (const s of sessions) {
  console.log(JSON.stringify({
    id: s.id, status: s.status, flow_id: s.flow_id, current_node_id: s.current_node_id,
    waiting_input: s.waiting_input, last_activity_at: s.last_activity_at, started_at: s.started_at,
    metadata: s.metadata,
  }, null, 2));
}

const session = sessions[0];

// Find runs linked to session
let runs = [];
if (session?.id) {
  const { data } = await sb.from("automation_runs").select("*").eq("session_id", session.id).order("started_at", { ascending: false });
  runs = data ?? [];
}

// Also find runs by flow around that time
const { data: flowRuns } = await sb.from("automation_runs").select("*").eq("flow_id", FLOW_ID).order("started_at", { ascending: false }).limit(20);
console.log(`\n=== Flow runs (${flowRuns?.length}) ===`);
for (const r of flowRuns ?? []) {
  console.log(`${r.started_at} | ${r.id} | ${r.status} | node=${(r.current_node_id ?? "").slice(0,8)} | phone=${r.variables?.customer_phone ?? "-"} | err=${(r.error_message ?? "").slice(0,100)}`);
}

if (!runs.length && flowRuns?.length) {
  // pick run closest in time to phone message
  const msgTime = new Date(phoneMsg.created_at).getTime();
  runs = flowRuns.filter((r) => {
    const t = new Date(r.started_at).getTime();
    return Math.abs(t - msgTime) < 30 * 60 * 1000; // within 30 min
  });
}

const targetRun = runs[0] ?? flowRuns?.[0];
console.log("\n=== TARGET RUN ===", targetRun?.id);

// Load flow + version nodes
const { data: flow } = await sb.from("automation_flows").select("*").eq("id", FLOW_ID).single();
const versionId = targetRun?.flow_version_id ?? flow?.active_version_id;
const { data: versionNodes } = await sb.from("automation_flow_version_nodes").select("*").eq("flow_version_id", versionId);
const nodeById = Object.fromEntries((versionNodes ?? []).map((n) => [n.id, n]));

function describeNode(id) {
  if (!id) return null;
  const n = nodeById[id];
  if (!n) return { id };
  const cfg = typeof n.config === "string" ? JSON.parse(n.config) : n.config;
  return { id, label: n.label, type: n.type, action: cfg?.action, inputKey: cfg?.inputKey, config: cfg };
}

// Delivery events for session/run
let deliveryEvents = [];
for (const col of ["session_id", "run_id", "automation_run_id"]) {
  const val = col === "session_id" ? session?.id : targetRun?.id;
  if (!val) continue;
  const { data, error } = await sb.from("channel_delivery_events").select("*").eq(col, val).order("created_at", { ascending: true });
  if (!error && data?.length) { deliveryEvents = data; break; }
}

// Also get delivery events by conversation
if (!deliveryEvents.length && conversationId) {
  const { data } = await sb.from("channel_delivery_events").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true });
  deliveryEvents = data ?? [];
}

console.log(`\n=== Delivery events (${deliveryEvents.length}) ===`);
for (const d of deliveryEvents.slice(-15)) {
  console.log(`${d.created_at} | ${d.status ?? d.event_type} | ${JSON.stringify(d.payload ?? d).slice(0, 120)}`);
}

// Check find customer node config in CURRENT active version
const findNode = (versionNodes ?? []).find((n) => {
  const cfg = typeof n.config === "string" ? JSON.parse(n.config) : n.config;
  return cfg?.action === "find_customer";
});
console.log("\n=== Find Customer node in active version ===");
console.log(JSON.stringify(findNode, null, 2));

const report = {
  investigatedAt: new Date().toISOString(),
  phoneMessage: phoneMsg,
  conversation,
  convMessages,
  session,
  allSessions: sessions,
  targetRun: targetRun ? {
    ...targetRun,
    currentNode: describeNode(targetRun.current_node_id),
  } : null,
  allFlowRuns: (flowRuns ?? []).map((r) => ({
    id: r.id, status: r.status, started_at: r.started_at,
    current_node_id: r.current_node_id,
    currentNode: describeNode(r.current_node_id),
    error_message: r.error_message,
    customer_phone: r.variables?.customer_phone,
    lookup: r.variables?.lookup,
    variables: r.variables,
  })),
  deliveryEvents,
  activeVersionId: flow?.active_version_id,
  findCustomerNode: findNode,
  outboundQueue: targetRun?.variables?.__outboundQueue,
};

const out = resolve(root, "docs/architecture/live-phone-reply-investigation.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2));
console.log("\nReport written:", out);
