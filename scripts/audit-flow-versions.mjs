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

const { count: draftCount } = await sb.from("automation_nodes").select("*", { count: "exact", head: true }).eq("flow_id", FLOW);
const { count: versionCount } = await sb.from("automation_flow_version_nodes").select("*", { count: "exact", head: true }).eq("flow_version_id", flow.active_version_id);

console.log({ draftCount, versionCount, active_version_id: flow.active_version_id, has_unpublished_draft: flow.has_unpublished_draft });

const { data: versions } = await sb.from("automation_flow_versions").select("id,version_number,created_at").eq("flow_id", FLOW).order("version_number", { ascending: false }).limit(5);
console.log("versions:", versions);

for (const v of versions ?? []) {
  const { count } = await sb.from("automation_flow_version_nodes").select("*", { count: "exact", head: true }).eq("flow_version_id", v.id);
  const { data: findNodes } = await sb.from("automation_flow_version_nodes").select("id,config").eq("flow_version_id", v.id).contains("config", { action: "find_customer" });
  console.log(`v${v.version_number} (${v.id}): nodes=${count}, find_customer=${findNodes?.length ?? 0}`);
  if (findNodes?.length) console.log(JSON.stringify(findNodes[0].config));
}
