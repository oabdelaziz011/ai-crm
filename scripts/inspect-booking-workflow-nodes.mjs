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
const tables = [
  { name: "automation_flow_version_nodes", filter: { flow_version_id: flow.active_version_id } },
  { name: "automation_nodes", filter: { flow_id: "aef7c4ab-513a-4b64-a700-2be6cf51dafc" } },
];
for (const { name, filter } of tables) {
  let q = sb.from(name).select("id,label,config,type");
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { data } = await q;
  console.log(`\n=== ${name} booking/crm ===`);
  for (const n of data ?? []) {
    const a = n.config?.action;
    if (["create_booking", "create_customer", "wait_for_input", "find_customer"].includes(a) || n.config?.inputKey === "customer_phone" || n.config?.inputKey === "customer_name") {
      console.log(JSON.stringify({ id: n.id, label: n.label, action: a, config: n.config }, null, 2));
    }
  }
}
