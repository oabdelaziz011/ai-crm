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
const versionId = "b63cd72a-7055-46f4-b58a-ce7e998f03c9";

const { data: edges } = await sb.from("automation_flow_version_edges").select("*").eq("flow_version_id", versionId);
const { data: nodes } = await sb.from("automation_flow_version_nodes").select("*").eq("flow_version_id", versionId);

const nl = (id) => {
  const n = nodes.find((x) => x.id === id);
  return `${n?.label ?? id.slice(0, 8)} [${n?.config?.action ?? n?.type}]`;
};

const WAITING = "991d1d70-7ec1-42e0-8cb5-1516a4f387ad";
console.log("=== OUTGOING FROM send_buttons (order in DB) ===");
for (const e of edges.filter((x) => x.source_node_id === WAITING)) {
  console.log(JSON.stringify({ id: e.id, sort: e.sort_order, target: nl(e.target_node_id), condition: e.condition }));
}

// dab15807 send_list config
const listNode = nodes.find((x) => x.id === "dab15807-8c0a-4f0a-9f0a-8c0a4f0a9f0a".slice(0,8));
const sendList = nodes.find((x) => x.config?.action === "send_list");
console.log("\n=== send_list nodes ===");
for (const n of nodes.filter((x) => x.config?.action === "send_list")) {
  console.log(JSON.stringify({ id: n.id, label: n.label, body: n.config?.body?.slice(0, 60), title: n.config?.title }));
}

// fc3d3353 IF after list - rules
const fc3 = nodes.find((x) => x.id === "fc3d3353-0d42-4638-a83f-67551d7b0ba6");
console.log("\n=== fc3d3353 IF rules ===");
console.log(JSON.stringify(fc3?.config?.ruleSet?.root?.rules, null, 2));

// Get send_buttons config
const btn = nodes.find((x) => x.id === WAITING);
console.log("\n=== send_buttons config ===");
console.log(JSON.stringify({ buttons: btn?.config?.buttons, text: btn?.config?.text ?? btn?.config?.message }));
