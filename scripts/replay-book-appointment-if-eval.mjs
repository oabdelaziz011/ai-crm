/**
 * Print IF node rules and replay Book Appointment branch evaluation.
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
const FLOW_VERSION = "b63cd72a-7055-46f4-b58a-ce7e998f03c9";
const RUN_ID = "239764a7-3051-4cb8-a5a7-ad988fbb0d2d";

const { data: nodes } = await sb.from("automation_flow_version_nodes").select("*").eq("flow_version_id", FLOW_VERSION);
const { data: edges } = await sb.from("automation_flow_version_edges").select("*").eq("flow_version_id", FLOW_VERSION);
const nodeMap = Object.fromEntries((nodes ?? []).map((n) => [n.id, n]));

function resolveField(field, vars) {
  if (!field.includes(".")) return vars[field];
  const [ns, key] = field.split(".");
  if (ns === "conversation") {
    const conv = vars.conversation && typeof vars.conversation === "object" ? vars.conversation : {};
    return conv[key];
  }
  return vars[field];
}

function evalRule(rule, vars) {
  const actual = resolveField(rule.field, vars);
  let matched = false;
  switch (rule.operator) {
    case "equals":
      matched = actual === rule.value;
      break;
    case "not_equals":
      matched = actual !== rule.value;
      break;
    default:
      matched = false;
  }
  return { field: rule.field, operator: rule.operator, expected: rule.value, actual, matched };
}

function evalIf(nodeId, vars) {
  const node = nodeMap[nodeId];
  const rules = node?.config?.ruleSet?.root?.rules ?? [];
  const clauses = rules.map((r) => evalRule(r, vars));
  const branch = clauses.every((c) => c.matched) ? "yes" : "no";
  const out = (edges ?? []).filter((e) => e.source_node_id === nodeId);
  const yesTarget = out.find((e) => e.condition?.branch === "yes")?.target_node_id;
  const noTarget = out.find((e) => e.source_node_id === nodeId && e.condition?.branch === "no")?.target_node_id;
  return {
    nodeId,
    nodeAction: node?.config?.action,
    nodeMessage: node?.config?.message,
    clauses,
    branch,
    yesTarget,
    yesTargetDesc: nodeMap[yesTarget]?.config?.action + " / " + (nodeMap[yesTarget]?.config?.message?.slice?.(0, 50) ?? nodeMap[yesTarget]?.config?.body?.slice?.(0, 50)),
    noTarget,
    noTargetDesc: nodeMap[noTarget]?.config?.action + " / " + (nodeMap[noTarget]?.config?.message?.slice?.(0, 50) ?? nodeMap[noTarget]?.config?.body?.slice?.(0, 50)),
  };
}

// State after Book Appointment selection applied by send_buttons node
const varsAfterBookSelection = {
  __waitingFor: null,
  interactive_selection: "book",
  conversation: {
    last_button_id: "book",
    last_button_title: "Book Appointment",
    last_message: "Book Appointment",
    last_selection_type: "button",
  },
};

console.log("=== INBOUND INTERACTIVE REPLY (live) ===");
console.log(JSON.stringify({
  replyId: "book",
  title: "Book Appointment",
  interactionType: "button_reply",
}, null, 2));

console.log("\n=== WORKFLOW CONTEXT AFTER BOOK SELECTION ===");
console.log(JSON.stringify(varsAfterBookSelection, null, 2));

console.log("\n=== send_buttons OUTGOING EDGES (order matters) ===");
const waitNode = "991d1d70-7ec1-42e0-8cb5-1516a4f387ad";
const outEdges = (edges ?? []).filter((e) => e.source_node_id === waitNode);
outEdges.forEach((e, i) => {
  console.log(`edge[${i}] -> ${e.target_node_id}`, {
    targetType: nodeMap[e.target_node_id]?.type,
    ruleSet: nodeMap[e.target_node_id]?.config?.ruleSet,
    condition: e.condition,
  });
});

console.log("\n=== resolveNextNodeId picks edge[0] only ===");
console.log("selected:", outEdges[0]?.target_node_id, "(Pricing IF d4a5623d)");

console.log("\n=== IF EVALUATION: d4a5623d (Pricing IF — FIRST edge, always taken) ===");
const pricingIf = evalIf("d4a5623d-cf4c-415a-b6cb-dbe28a2e4baf", varsAfterBookSelection);
console.log(JSON.stringify(pricingIf, null, 2));

console.log("\n=== IF EVALUATION: 014b0bf2 (Book IF — SECOND edge, NEVER reached) ===");
const bookIf = evalIf("014b0bf2-0a67-4a4a-9bd2-d55144dc6f29", varsAfterBookSelection);
console.log(JSON.stringify(bookIf, null, 2));

// Ask question node - search for wait_for_reply or ask
console.log("\n=== ASK QUESTION / WAIT NODES ===");
for (const n of nodes ?? []) {
  if (n.config?.action === "wait_for_reply" || n.config?.action === "ask_question" || n.label?.toLowerCase?.().includes("ask")) {
    console.log({ id: n.id, label: n.label, action: n.config?.action, config: n.config });
  }
}

// Full rule dump for key IF nodes
for (const id of ["d4a5623d-cf4c-415a-b6cb-dbe28a2e4baf", "014b0bf2-0a67-4a4a-9bd2-d55144dc6f29", "04926bf7-8d19-447f-b44d-c6a29156874c"]) {
  const n = nodeMap[id];
  console.log(`\n=== FULL RULESET ${id} ===`);
  console.log(JSON.stringify(n?.config?.ruleSet, null, 2));
}

// Live run variables at time of book reply
const { data: run } = await sb.from("automation_runs").select("variables").eq("id", RUN_ID).single();
console.log("\n=== LIVE RUN conversation.* at latest state ===");
console.log(JSON.stringify(run?.variables?.conversation, null, 2));
console.log("interactive_selection:", run?.variables?.interactive_selection);
console.log("__branch:", run?.variables?.__branch);
