/**
 * Complete Book Appointment workflow trace: button → phone → find_customer → IF → ...
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  createServiceRoleSupabaseClient,
  loadDevScriptEnv,
  resolveArgOrEnv,
} from "./lib/dev-script-env.mjs";

const { root, env } = loadDevScriptEnv(import.meta.url);
const argv = process.argv.slice(2);
const FLOW_ID = resolveArgOrEnv(argv, 0, ["FLOW_ID", "AUTOMATION_FLOW_ID"], env, "automation flow id");
const COMPANY_ID = resolveArgOrEnv(argv, 1, ["COMPANY_ID", "VERIFY_COMPANY_ID"], env, "company id");
const sb = createServiceRoleSupabaseClient(env, createClient);

function parseCfg(n) {
  return typeof n?.config === "string" ? JSON.parse(n.config) : n?.config ?? {};
}

function describeNode(n) {
  if (!n) return null;
  const cfg = parseCfg(n);
  return {
    id: n.id,
    label: n.label,
    type: n.type,
    action: cfg.action,
    builderType: cfg.builderType,
    inputKey: cfg.inputKey,
    prompt: cfg.prompt,
    lookupBy: cfg.lookupBy,
    valueBinding: cfg.value?.variable ?? cfg.value,
    ruleSet: cfg.ruleSet,
    lookup: cfg.lookup,
    mode: cfg.mode,
    cases: cfg.cases,
    switchField: cfg.field,
  };
}

const { data: flow } = await sb.from("automation_flows").select("*").eq("id", FLOW_ID).single();
const VERSION = flow.active_version_id;

const { data: version } = await sb.from("automation_flow_versions").select("*").eq("id", VERSION).single();
const { data: nodes } = await sb.from("automation_flow_version_nodes").select("*").eq("flow_version_id", VERSION);
const { data: edges } = await sb.from("automation_flow_version_edges").select("*").eq("flow_version_id", VERSION);
const nodeById = Object.fromEntries((nodes ?? []).map((n) => [n.id, n]));

// Find switch node on conversation.last_button_id
const switchNode = (nodes ?? []).find((n) => {
  const cfg = parseCfg(n);
  return n.type === "condition" && cfg.mode === "switch";
});
console.log("Active version:", VERSION, "v" + version?.version_number);

// Map book branch from switch
const switchOut = (edges ?? []).filter((e) => e.source_node_id === switchNode?.id);
const bookEdge = switchOut.find((e) => e.condition?.case === "book" || e.condition?.value === "book");
console.log("Switch node:", describeNode(switchNode));
console.log("Switch outgoing:", switchOut.map((e) => ({ case: e.condition, target: describeNode(nodeById[e.target_node_id])?.label })));

// Walk book path BFS
function walkPath(startId, maxSteps = 20) {
  const path = [];
  let current = startId;
  const seen = new Set();
  for (let i = 0; i < maxSteps; i++) {
    if (!current || seen.has(current)) break;
    seen.add(current);
    const n = nodeById[current];
    path.push(describeNode(n));
    const out = (edges ?? []).filter((e) => e.source_node_id === current);
    if (out.length === 0) break;
    // For conditions, show both branches
    if (n?.type === "condition" && parseCfg(n).mode !== "switch") {
      path[path.length - 1].branches = out.map((e) => ({
        branch: e.condition?.branch ?? e.condition,
        target: describeNode(nodeById[e.target_node_id]),
      }));
      break;
    }
    current = out[0]?.target_node_id;
  }
  return path;
}

const bookStart = bookEdge?.target_node_id;
console.log("\n=== BOOK PATH (linear until IF) ===");
const bookPath = walkPath(bookStart);
for (const n of bookPath) console.log(JSON.stringify(n, null, 2));

// Find customer node details
const findNode = (nodes ?? []).find((n) => parseCfg(n).action === "find_customer");
const ifNode = (edges ?? []).find((e) => e.source_node_id === findNode?.id);
const ifNodeObj = ifNode ? nodeById[ifNode.target_node_id] : null;
const ifOut = (edges ?? []).filter((e) => e.source_node_id === ifNodeObj?.id);

console.log("\n=== FIND CUSTOMER + IF ===");
console.log("Find:", JSON.stringify(describeNode(findNode), null, 2));
console.log("IF:", JSON.stringify(describeNode(ifNodeObj), null, 2));
console.log("IF branches:", ifOut.map((e) => ({
  branch: e.condition?.branch,
  target: describeNode(nodeById[e.target_node_id]),
})));

// Doctor list nodes
const doctorListNodes = (nodes ?? []).filter((n) => {
  const cfg = parseCfg(n);
  const s = JSON.stringify(cfg);
  return s.includes("Choose a doctor") || cfg.title === "Choose a doctor";
});
console.log("\n=== DOCTOR LIST NODES ===");
for (const n of doctorListNodes) console.log(JSON.stringify(describeNode(n), null, 2));

// Recent book runs with phone
const { data: recentRuns } = await sb
  .from("automation_runs")
  .select("*")
  .eq("flow_id", FLOW_ID)
  .order("started_at", { ascending: false })
  .limit(30);

const bookRuns = (recentRuns ?? []).filter((r) => {
  const v = r.variables ?? {};
  return v.__switchCase === "book" || v.conversation?.last_button_id === "book" || v.interactive_selection === "book";
});

console.log(`\n=== RECENT BOOK RUNS (${bookRuns.length}) ===`);
for (const r of bookRuns.slice(0, 8)) {
  console.log(JSON.stringify({
    id: r.id,
    status: r.status,
    started_at: r.started_at,
    current_node_id: r.current_node_id,
    currentNode: describeNode(nodeById[r.current_node_id]),
    customer_phone: r.variables?.customer_phone,
    lookup: r.variables?.lookup,
    customer: r.variables?.customer,
    error: r.error_message?.slice(0, 120),
    __waitingFor: r.variables?.__waitingFor,
  }, null, 2));
}

// Pick best run: has customer_phone and reached find_customer or beyond
const targetRun = bookRuns.find((r) => r.variables?.customer_phone && r.status !== "waiting_input") 
  ?? bookRuns.find((r) => r.variables?.customer_phone)
  ?? bookRuns[0];

console.log("\n=== TARGET RUN ===", targetRun?.id);

// Customer DB lookup for target phone
let customerQueryResult = null;
if (targetRun?.variables?.customer_phone) {
  const phone = String(targetRun.variables.customer_phone).trim();
  const { count } = await sb.from("customers").select("id", { count: "exact", head: true }).eq("company_id", COMPANY_ID).eq("phone", phone);
  const { data: record } = await sb.from("customers").select("id, name, phone, email, age, gender").eq("company_id", COMPANY_ID).eq("phone", phone).limit(1).maybeSingle();
  customerQueryResult = { phone, count, record };
  console.log("Customer query:", JSON.stringify(customerQueryResult, null, 2));
}

// Resolve binding for find_customer
const findCfg = parseCfg(findNode);
const binding = findCfg.value?.variable ?? findCfg.value;
const samplePhone =
  targetRun?.variables?.customer_phone ??
  env.SAMPLE_CUSTOMER_PHONE ??
  process.env.SAMPLE_CUSTOMER_PHONE ??
  null;
const customerPhoneInScope = samplePhone;
const customerNestedPhone = targetRun?.variables?.customer?.phone ?? null;

function resolveBinding(expr, vars) {
  if (!expr || typeof expr !== "string") return String(expr ?? "");
  const m = expr.match(/^\{\{(.+)\}\}$/);
  if (!m) return expr;
  const parts = m[1].split(".");
  let cur = vars;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return "";
    cur = cur[p];
  }
  return cur == null ? "" : String(cur);
}

const resolvedLookup = resolveBinding(typeof binding === "object" ? binding.variable : binding, {
  customer_phone: customerPhoneInScope,
  customer: targetRun?.variables?.customer ?? {},
});

console.log("\n=== BINDING RESOLUTION ===");
console.log({ binding, customer_phone: customerPhoneInScope, customer_phone_nested: customerNestedPhone, resolvedLookup });

const report = {
  tracedAt: new Date().toISOString(),
  flowId: FLOW_ID,
  activeVersionId: VERSION,
  versionNumber: version?.version_number,
  switchNode: describeNode(switchNode),
  bookPath,
  findCustomerNode: describeNode(findNode),
  ifNode: describeNode(ifNodeObj),
  ifBranches: ifOut.map((e) => ({ branch: e.condition?.branch, target: describeNode(nodeById[e.target_node_id]) })),
  doctorListNodes: doctorListNodes.map(describeNode),
  targetRun: targetRun ? {
    id: targetRun.id,
    status: targetRun.status,
    current_node_id: targetRun.current_node_id,
    currentNode: describeNode(nodeById[targetRun.current_node_id]),
    error_message: targetRun.error_message,
    variables: targetRun.variables,
  } : null,
  customerQueryResult,
  bindingResolution: { binding, customer_phone: customerPhoneInScope, resolvedLookup },
  recentBookRuns: bookRuns.slice(0, 5).map((r) => ({
    id: r.id, status: r.status, customer_phone: r.variables?.customer_phone,
    lookup: r.variables?.lookup, currentNode: describeNode(nodeById[r.current_node_id]),
  })),
};

const outPath = resolve(root, "docs/architecture/book-workflow-complete-trace.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log("\nReport:", outPath);
