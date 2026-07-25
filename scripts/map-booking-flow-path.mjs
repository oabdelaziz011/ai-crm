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
const { data: flow } = await sb.from("automation_flows").select("active_version_id").eq("id", "aef7c4ab-513a-4b64-a700-2be6cf51dafc").single();
const VERSION = flow.active_version_id;
const { data: nodes } = await sb.from("automation_flow_version_nodes").select("id,label,config,type").eq("flow_version_id", VERSION);
const { data: edges } = await sb.from("automation_flow_version_edges").select("*").eq("flow_version_id", VERSION);
const nodeById = Object.fromEntries((nodes ?? []).map((n) => [n.id, n]));

function describe(id) {
  const n = nodeById[id];
  if (!n) return id;
  const cfg = typeof n.config === "string" ? JSON.parse(n.config) : n.config;
  return `${n.label || id.slice(0, 8)} [${cfg?.action ?? n.type}]`;
}

const FIND = "a05b1c07-85c0-4cae-b45f-4983b3bc0a32";
const CREATE_BOOKING = "5b29cd6b-1375-44fb-bc64-94fa789200ae";
const CREATE_CUSTOMER = "a1b0279a-c767-447a-b912-a063e853a9c2";
const ASK_NAME = "1527249e-614c-4f15-954b-388e8970c8a6";

console.log("=== from find_customer ===");
for (const e of edges ?? []) {
  if (e.source_node_id === FIND) {
    console.log(`${describe(e.source_node_id)} -> ${describe(e.target_node_id)}`, e.condition);
  }
}

console.log("\n=== path to create_booking ===");
function walk(from, depth = 0, seen = new Set()) {
  if (seen.has(from) || depth > 8) return;
  seen.add(from);
  for (const e of edges ?? []) {
    if (e.source_node_id === from) {
      console.log("  ".repeat(depth) + `${describe(from)} -> ${describe(e.target_node_id)}`, JSON.stringify(e.condition));
      walk(e.target_node_id, depth + 1, seen);
    }
  }
}
walk(FIND);

console.log("\n=== create_booking incoming ===");
for (const e of edges ?? []) {
  if (e.target_node_id === CREATE_BOOKING) {
    console.log(`${describe(e.source_node_id)} -> create_booking`, e.condition);
  }
}

console.log("\n=== create_customer path ===");
for (const e of edges ?? []) {
  if (e.source_node_id === CREATE_CUSTOMER || e.target_node_id === CREATE_CUSTOMER) {
    console.log(`${describe(e.source_node_id)} -> ${describe(e.target_node_id)}`, e.condition);
  }
}
