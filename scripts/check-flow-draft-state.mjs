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

const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const VERSION_ID = "b63cd72a-7055-46f4-b58a-ce7e998f03c9";
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: flow } = await sb.from("automation_flows").select("*").eq("id", FLOW_ID).single();
const { count: draftNodes } = await sb.from("automation_nodes").select("*", { count: "exact", head: true }).eq("flow_id", FLOW_ID);
const { count: draftEdges } = await sb.from("automation_edges").select("*", { count: "exact", head: true }).eq("flow_id", FLOW_ID);
const { count: versionNodes } = await sb.from("automation_flow_version_nodes").select("*", { count: "exact", head: true }).eq("flow_version_id", VERSION_ID);
const { count: versionEdges } = await sb.from("automation_flow_version_edges").select("*", { count: "exact", head: true }).eq("flow_version_id", VERSION_ID);

console.log(JSON.stringify({ flow, draftNodes, draftEdges, versionNodes, versionEdges }, null, 2));
