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
const FIND = "c078acba-0cd1-4e3c-a803-8ce11407b6e3";
const { data: flow } = await sb.from("automation_flows").select("active_version_id").eq("id", "aef7c4ab-513a-4b64-a700-2be6cf51dafc").single();
const VERSION = flow.active_version_id;

const { data: nodes } = await sb.from("automation_flow_version_nodes").select("*").eq("flow_version_id", VERSION);
const { data: edges } = await sb.from("automation_flow_version_edges").select("*").eq("flow_version_id", VERSION);
const nodeById = Object.fromEntries((nodes ?? []).map((n) => [n.id, n]));

const findOut = (edges ?? []).filter((e) => e.source_node_id === FIND);
console.log("Active version:", VERSION);
console.log("Find customer:", JSON.stringify(nodeById[FIND]?.config, null, 2));
console.log("Outgoing:");
for (const e of findOut) {
  const t = nodeById[e.target_node_id];
  console.log(JSON.stringify({
    target: e.target_node_id,
    label: t?.label,
    type: t?.type,
    action: t?.config?.action,
    mode: t?.config?.mode,
    ruleSet: t?.config?.ruleSet,
    condition: e.condition,
  }, null, 2));
}
