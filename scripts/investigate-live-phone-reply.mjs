/**
 * Investigate latest live WhatsApp phone-reply run for CNV-000010 flow.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const PHONE_HINT = process.argv[2] ?? "01023169075";

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

const { data: flow } = await sb.from("automation_flows").select("*").eq("id", FLOW_ID).single();

const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
const { data: runs } = await sb
  .from("automation_runs")
  .select("*")
  .eq("flow_id", FLOW_ID)
  .gte("created_at", since)
  .order("created_at", { ascending: false })
  .limit(50);

console.log(`Found ${runs?.length ?? 0} recent runs`);
for (const r of runs ?? []) {
  const vars = r.variables ?? {};
  console.log(`  ${r.id} | ${r.status} | node=${(r.current_node_id ?? "").slice(0, 8)} | phone=${vars.customer_phone ?? "-"} | err=${(r.error_message ?? "").slice(0, 60)} | ${r.created_at}`);
}

let targetRun = (runs ?? []).find((r) => {
  const v = r.variables ?? {};
  const phone = String(v.customer_phone ?? "");
  return phone === PHONE_HINT || phone.includes("1023169075") || phone.includes(PHONE_HINT);
});

if (!targetRun) targetRun = runs?.[0];
if (!targetRun) { console.error("No run found"); process.exit(1); }

console.log("\n=== TARGET RUN ===", targetRun.id);

const runId = targetRun.id;
const sessionId = targetRun.session_id;

const { data: session } = sessionId
  ? await sb.from("conversation_sessions").select("*").eq("id", sessionId).single()
  : { data: null };

const versionId = flow?.active_version_id ?? targetRun.flow_version_id;
const { data: versionNodes } = versionId
  ? await sb.from("automation_flow_version_nodes").select("id,label,config,type").eq("flow_version_id", versionId)
  : { data: [] };
const nodeById = Object.fromEntries((versionNodes ?? []).map((n) => [n.id, n]));

function describeNode(id) {
  if (!id) return null;
  const n = nodeById[id];
  if (!n) return { id, label: null, action: null };
  const cfg = typeof n.config === "string" ? JSON.parse(n.config) : n.config;
  return { id, label: n.label, type: n.type, action: cfg?.action, inputKey: cfg?.inputKey, builderType: cfg?.builderType };
}

async function queryTable(table, filters) {
  let q = sb.from(table).select("*");
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  const { data, error } = await q.order("created_at", { ascending: true });
  return { data: data ?? [], error: error?.message ?? null };
}

const eventsTables = ["automation_run_events", "automation_events", "workflow_run_events"];
let automationEvents = [];
let eventsTableUsed = null;
for (const table of eventsTables) {
  for (const col of ["run_id", "automation_run_id"]) {
    const { data, error } = await queryTable(table, { [col]: runId });
    if (!error && data.length > 0) { automationEvents = data; eventsTableUsed = `${table}.${col}`; break; }
  }
  if (eventsTableUsed) break;
}

let conversationMessages = [];
if (session?.conversation_id) {
  const { data } = await sb.from("conversation_messages").select("*").eq("conversation_id", session.conversation_id).order("created_at", { ascending: true });
  conversationMessages = data ?? [];
} else if (session?.external_thread_id) {
  const { data: conv } = await sb.from("conversations").select("id").eq("external_thread_id", session.external_thread_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (conv?.id) {
    const { data } = await sb.from("conversation_messages").select("*").eq("conversation_id", conv.id).order("created_at", { ascending: true });
    conversationMessages = data ?? [];
  }
}

const deliveryTables = ["channel_delivery_events", "channel_message_delivery_events", "delivery_events", "channel_outbound_messages"];
let deliveryEvents = [];
let deliveryTableUsed = null;
for (const table of deliveryTables) {
  for (const col of ["run_id", "automation_run_id", "session_id"]) {
    const { data, error } = await sb.from(table).select("*").eq(col, col === "session_id" ? sessionId : runId).order("created_at", { ascending: true });
    if (!error && data?.length) { deliveryEvents = data; deliveryTableUsed = `${table}.${col}`; break; }
  }
  if (deliveryTableUsed) break;
}

const outboundQueue = targetRun.variables?.__outboundQueue ?? targetRun.variables?.outbound_queue ?? null;

const report = {
  investigatedAt: new Date().toISOString(),
  phoneHint: PHONE_HINT,
  flowId: FLOW_ID,
  activeVersionId: flow?.active_version_id,
  targetRunId: runId,
  run: {
    id: targetRun.id,
    status: targetRun.status,
    current_node_id: targetRun.current_node_id,
    currentNode: describeNode(targetRun.current_node_id),
    waiting_input: targetRun.waiting_input,
    error_message: targetRun.error_message,
    started_at: targetRun.started_at,
    finished_at: targetRun.finished_at,
    created_at: targetRun.created_at,
    updated_at: targetRun.updated_at,
    flow_version_id: targetRun.flow_version_id,
    variables: targetRun.variables,
  },
  session: session ? {
    id: session.id,
    status: session.status,
    waiting_input: session.waiting_input,
    current_node_id: session.current_node_id,
    external_thread_id: session.external_thread_id,
    last_activity_at: session.last_activity_at,
    metadata: session.metadata,
  } : null,
  eventsTableUsed,
  automationEvents,
  conversationMessages,
  deliveryTableUsed,
  deliveryEvents,
  outboundQueue,
  allRecentRuns: (runs ?? []).slice(0, 15).map((r) => ({
    id: r.id,
    status: r.status,
    current_node_id: r.current_node_id,
    currentNode: describeNode(r.current_node_id),
    customer_phone: r.variables?.customer_phone,
    created_at: r.created_at,
    error_message: r.error_message,
    waiting_input: r.waiting_input,
  })),
};

const outPath = resolve(root, "docs/architecture/live-phone-reply-investigation.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log("\nReport:", outPath);
console.log(JSON.stringify({
  runId,
  status: targetRun.status,
  currentNode: describeNode(targetRun.current_node_id),
  waiting_input: targetRun.waiting_input,
  error_message: targetRun.error_message,
  customer_phone: targetRun.variables?.customer_phone,
  lookup: targetRun.variables?.lookup,
  eventsCount: automationEvents.length,
  messagesCount: conversationMessages.length,
}, null, 2));
