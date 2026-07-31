/**
 * Inspect connectivity between selected workflow nodes in the active published graph.
 *
 * Usage:
 *   node scripts/inspect-book-graph-connectivity.mjs [flowId] [servicesNodeId] [doctorNodeId]
 *
 * Env:
 *   FLOW_ID / AUTOMATION_FLOW_ID
 *   SERVICES_NODE_ID
 *   DOCTOR_NODE_ID
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import {
  createServiceRoleSupabaseClient,
  loadDevScriptEnv,
  resolveArgOrEnv,
} from "./lib/dev-script-env.mjs";

const { env } = loadDevScriptEnv(import.meta.url);
const argv = process.argv.slice(2);
const FLOW_ID = resolveArgOrEnv(argv, 0, ["FLOW_ID", "AUTOMATION_FLOW_ID"], env, "automation flow id");
const SERVICES = resolveArgOrEnv(argv, 1, ["SERVICES_NODE_ID"], env, "services node id");
const DOCTOR = resolveArgOrEnv(argv, 2, ["DOCTOR_NODE_ID"], env, "doctor node id");

const sb = createServiceRoleSupabaseClient(env, createClient);
const { data: flow } = await sb.from("automation_flows").select("active_version_id").eq("id", FLOW_ID).single();
const VERSION = flow.active_version_id;
const { data: nodes } = await sb.from("automation_flow_version_nodes").select("id,label,config,type").eq("flow_version_id", VERSION);
const { data: edges } = await sb.from("automation_flow_version_edges").select("*").eq("flow_version_id", VERSION);
const nodeById = Object.fromEntries((nodes ?? []).map((n) => [n.id, n]));
function desc(id) {
  const n = nodeById[id];
  const c = n?.config ?? {};
  return { id, label: n?.label, action: c.action, lookup: c.lookup, title: c.title, builderType: c.builderType };
}
console.log("Services node:", desc(SERVICES));
console.log("Doctor node:", desc(DOCTOR));
console.log("\nIncoming to services:");
for (const e of edges ?? []) if (e.target_node_id === SERVICES) console.log(desc(e.source_node_id), e.condition);
console.log("\nOutgoing from services:");
for (const e of edges ?? []) if (e.source_node_id === SERVICES) console.log("->", desc(e.target_node_id), e.condition);
console.log("\nIncoming to doctor:");
for (const e of edges ?? []) if (e.target_node_id === DOCTOR) console.log(desc(e.source_node_id), e.condition);
console.log("\nOutgoing from doctor:");
for (const e of edges ?? []) if (e.source_node_id === DOCTOR) console.log("->", desc(e.target_node_id), e.condition);
console.log("\nAll list nodes:");
for (const n of nodes ?? []) {
  if (n.config?.action === "send_list") {
    const out = (edges ?? []).filter((e) => e.source_node_id === n.id).length;
    const inn = (edges ?? []).filter((e) => e.target_node_id === n.id).length;
    console.log(desc(n.id), { in: inn, out });
  }
}
