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
const { data: flow } = await sb.from("automation_flows").select("*").eq("id", "aef7c4ab-513a-4b64-a700-2be6cf51dafc").single();
console.log("active_version:", flow.active_version_id);

const tables = ["automation_flow_version_nodes", "automation_nodes"];
for (const table of tables) {
  const q = sb.from(table).select("id,label,config");
  const { data } = table.includes("version")
    ? await q.eq("flow_version_id", flow.active_version_id)
    : await q.eq("flow_id", flow.id);
  console.log(`\n=== ${table} CRM-related ===`);
  for (const n of data ?? []) {
    const action = n.config?.action;
    if (action?.includes("customer") || action === "find_customer" || action === "create_customer" || action === "wait_for_input") {
      if (action?.includes("customer") || n.config?.inputKey === "customer_phone") {
        console.log(JSON.stringify({ id: n.id, label: n.label, config: n.config }, null, 2));
      }
    }
  }
}

// sample existing customer for company
const { data: customers } = await sb.from("customers").select("id,name,phone,company_id").eq("company_id", flow.company_id).limit(3);
console.log("\n=== sample customers ===", customers);
