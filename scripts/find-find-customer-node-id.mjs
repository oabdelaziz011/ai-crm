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
const { data: flow } = await sb.from("automation_flows").select("active_version_id").eq("id", FLOW).single();

const { data: findInDraft } = await sb.from("automation_nodes").select("id,config").eq("flow_id", FLOW).contains("config", { builderType: "find_customer" });
const { data: findInVersion } = await sb.from("automation_flow_version_nodes").select("id,config").eq("flow_version_id", flow.active_version_id).contains("config", { builderType: "find_customer" });

console.log("draft find:", findInDraft);
console.log("version find:", findInVersion);

const { data: createInVersion } = await sb.from("automation_flow_version_nodes").select("id,config,label").eq("flow_version_id", flow.active_version_id).contains("config", { builderType: "create_customer" });
console.log("create_customer:", createInVersion);
