import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: nodes } = await sb.from("automation_nodes").select("id, type, config").eq("flow_id", FLOW_ID);
const { data: edges } = await sb.from("automation_edges").select("*").eq("flow_id", FLOW_ID);

const byId = new Map((nodes ?? []).map((n) => [n.id, n]));

function label(id) {
  const n = byId.get(id);
  const cfg = n?.config ?? {};
  return `${id.slice(0, 8)} ${cfg.action ?? cfg.builderType ?? n?.type} ${cfg.prompt ?? cfg.body ?? cfg.inputKey ?? ""}`.slice(0, 80);
}

// Find create_customer and walk backwards
const create = (nodes ?? []).find((n) => n.config?.action === "create_customer");
console.log("create", create?.id, create?.config);

const incoming = new Map();
for (const e of edges ?? []) {
  if (!incoming.has(e.target_node_id)) incoming.set(e.target_node_id, []);
  incoming.get(e.target_node_id).push(e.source_node_id);
}

let cur = create?.id;
const chain = [];
while (cur) {
  chain.unshift({ id: cur, label: label(cur), config: byId.get(cur)?.config });
  const srcs = incoming.get(cur) ?? [];
  cur = srcs[0];
  if (chain.length > 15) break;
}
console.log("\nchain to create_customer:");
for (const c of chain) console.log(c.label);
