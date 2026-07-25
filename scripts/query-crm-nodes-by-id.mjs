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
const FLOW = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const { data: flow } = await sb.from("automation_flows").select("*").eq("id", FLOW).single();
console.log("flow", { active_version_id: flow.active_version_id, company_id: flow.company_id });

const ids = ["c078acba-0cd1-4e3c-a803-8ce11407b6e3", "0bf11653-f706-4806-84ff-85ffb30557fa", "d2da8df9-7330-4b6b-93e8-592638e7e41a", "5739fca3-2096-4722-93c0-49df6db0cfdd"];

for (const table of ["automation_flow_version_nodes", "automation_nodes"]) {
  console.log("\n===", table, "===");
  const q = sb.from(table).select("id,config,label");
  const { data } = table.includes("version")
    ? await q.eq("flow_version_id", flow.active_version_id).in("id", ids)
    : await q.eq("flow_id", FLOW).in("id", ids);
  for (const n of data ?? []) console.log(JSON.stringify(n, null, 2));
}

// all nodes with find in config text
const { data: allVersion } = await sb.from("automation_flow_version_nodes").select("id,config,label").eq("flow_version_id", flow.active_version_id);
const crm = (allVersion ?? []).filter((n) => JSON.stringify(n.config).includes("customer"));
console.log("\n=== all crm-ish version nodes ===", crm.length);
for (const n of crm) console.log(JSON.stringify({ id: n.id, label: n.label, action: n.config?.action, builderType: n.config?.builderType, value: n.config?.value, inputKey: n.config?.inputKey }, null, 2));
