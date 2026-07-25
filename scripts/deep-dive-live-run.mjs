/**
 * Deep dive into run e015ea13-930f-4bb3-ab30-a444383ba2a2
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUN_ID = "e015ea13-930f-4bb3-ab30-a444383ba2a2";
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

const { data: run } = await sb.from("automation_runs").select("*").eq("id", RUN_ID).single();
const { data: flow } = await sb.from("automation_flows").select("*").eq("id", FLOW_ID).single();

const versionId = run.flow_version_id ?? flow.active_version_id;
const { data: version } = await sb.from("automation_flow_versions").select("*").eq("id", versionId).single();
const { data: nodes } = await sb.from("automation_flow_version_nodes").select("*").eq("flow_version_id", versionId);
const { data: edges } = await sb.from("automation_flow_version_edges").select("*").eq("flow_version_id", versionId);

const nodeById = Object.fromEntries((nodes ?? []).map((n) => [n.id, n]));

function describeNode(id) {
  const n = nodeById[id];
  if (!n) return { id, missing: true };
  const cfg = typeof n.config === "string" ? JSON.parse(n.config) : n.config;
  return { id, label: n.label, type: n.type, action: cfg?.action, inputKey: cfg?.inputKey, config: cfg };
}

// Trace path: find ask question node, find customer, etc.
const askPhone = (nodes ?? []).find((n) => {
  const cfg = typeof n.config === "string" ? JSON.parse(n.config) : n.config;
  return cfg?.inputKey === "customer_phone";
});
const findCustomer = (nodes ?? []).find((n) => {
  const cfg = typeof n.config === "string" ? JSON.parse(n.config) : n.config;
  return cfg?.action === "find_customer";
});

// Edges into/out of current node
const currentId = run.current_node_id;
const inEdges = (edges ?? []).filter((e) => e.target_node_id === currentId);
const outEdges = (edges ?? []).filter((e) => e.source_node_id === currentId);

// Delivery events for this run
const { data: deliveries } = await sb.from("channel_delivery_events").select("*").contains("payload", { metadata: { automationRunId: RUN_ID } });
let deliveryForRun = deliveries ?? [];
if (!deliveryForRun.length) {
  const { data: allDel } = await sb.from("channel_delivery_events").select("*").order("created_at", { ascending: false }).limit(100);
  deliveryForRun = (allDel ?? []).filter((d) => JSON.stringify(d).includes(RUN_ID));
}

// Conversation messages during this run timeframe
const runStart = new Date(run.started_at);
const windowStart = new Date(runStart.getTime() - 60000).toISOString();
const windowEnd = new Date(runStart.getTime() + 10 * 60000).toISOString();
const { data: msgs } = await sb.from("conversation_messages").select("*").gte("created_at", windowStart).lte("created_at", windowEnd).order("created_at", { ascending: true });

// Previous stuck run for same phone
const { data: prevRun } = await sb.from("automation_runs").select("*").eq("id", "3270a004-5f12-4410-80bb-9182a535a34c").single();

// Simulate binding resolution
const vars = run.variables ?? {};
const customerPhone = vars.customer_phone;
const customerEntityPhone = vars.customer?.phone;
const binding = findCustomer ? (typeof findCustomer.config === "string" ? JSON.parse(findCustomer.config) : findCustomer.config)?.value?.variable : null;

const report = {
  investigatedAt: new Date().toISOString(),
  runId: RUN_ID,
  run: {
    id: run.id,
    status: run.status,
    current_node_id: run.current_node_id,
    currentNode: describeNode(run.current_node_id),
    error_message: run.error_message,
    started_at: run.started_at,
    finished_at: run.finished_at,
    flow_version_id: run.flow_version_id,
    session_id: run.session_id,
    metadata: run.metadata,
    variables: run.variables,
  },
  executionAnalysis: {
    lastSuccessfulNode: describeNode(askPhone?.id),
    firstFailedOrStuckNode: describeNode(currentId),
    stuckAtFindCustomer: currentId === findCustomer?.id,
    bindingResolution: {
      findCustomerBinding: binding,
      customer_phone_variable: customerPhone,
      customer_entity_phone: customerEntityPhone,
      resolvedLookupValueWouldBe: customerEntityPhone ?? null,
      mismatch: binding === "{{customer.phone}}" && customerPhone && !customerEntityPhone,
    },
  },
  activeVersion: {
    id: versionId,
    versionNumber: version?.version_number,
    publishedAt: version?.created_at,
  },
  findCustomerNode: findCustomer,
  askPhoneNode: askPhone,
  inEdgesToCurrent: inEdges.map((e) => ({ from: describeNode(e.source_node_id), condition: e.condition })),
  outEdgesFromCurrent: outEdges.map((e) => ({ to: describeNode(e.target_node_id), condition: e.condition })),
  deliveryEventsForRun: deliveryForRun,
  messagesDuringRun: msgs,
  previousStuckRun: prevRun ? {
    id: prevRun.id,
    status: prevRun.status,
    current_node_id: prevRun.current_node_id,
    currentNode: describeNode(prevRun.current_node_id),
    customer_phone: prevRun.variables?.customer_phone,
    flow_version_id: prevRun.flow_version_id,
    error_message: prevRun.error_message,
    variables: prevRun.variables,
  } : null,
  outboundAfterPhoneReply: (msgs ?? []).filter((m) => {
    const t = new Date(m.created_at).getTime();
    const phoneTime = new Date("2026-07-25T00:30:59.165704+00:00").getTime();
    return t > phoneTime && m.direction !== "inbound";
  }),
};

const out = resolve(root, "docs/architecture/live-phone-reply-deep-dive.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  runId: RUN_ID,
  status: run.status,
  currentNode: describeNode(run.current_node_id),
  error_message: run.error_message,
  customer_phone: vars.customer_phone,
  lookup: vars.lookup,
  binding: binding,
  versionNumber: version?.version_number,
  versionId,
  stuckReason: report.executionAnalysis.bindingResolution,
}, null, 2));
