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
const VERSION = "51022517-74a8-4179-af4f-83d220e1bbd1";
const BUTTONS = "991d1d70-7ec1-42e0-8cb5-1516a4f387ad";
const RUN_ID = "0a10b456-c2ad-4a0a-a076-9d2f1dbbcad4";

const { data: nodes } = await sb.from("automation_flow_version_nodes").select("id,type,config").eq("flow_version_id", VERSION);
const { data: edges } = await sb.from("automation_flow_version_edges").select("*").eq("flow_version_id", VERSION);
const nodeById = Object.fromEntries((nodes ?? []).map((n) => [n.id, n]));
const btnEdge = edges?.find((e) => e.source_node_id === BUTTONS);
const switchId = btnEdge?.target_node_id;
const switchOut = edges?.filter((e) => e.source_node_id === switchId);

console.log("=== VERSION GRAPH SWITCH ===");
console.log(JSON.stringify({
  btnTarget: switchId,
  switchMode: nodeById[switchId]?.config?.mode,
  switchField: nodeById[switchId]?.config?.field,
  switchCases: nodeById[switchId]?.config?.cases,
  switchOut: switchOut?.map((e) => ({
    case: e.condition?.case,
    target: e.target_node_id,
    targetAction: nodeById[e.target_node_id]?.config?.action,
    prompt: nodeById[e.target_node_id]?.config?.prompt,
    message: nodeById[e.target_node_id]?.config?.message?.slice?.(0, 50),
  })),
}, null, 2));

const { data: run } = await sb.from("automation_runs").select("*").eq("id", RUN_ID).single();
const { data: session } = await sb
  .from("conversation_sessions")
  .select("*")
  .eq("automation_run_id", RUN_ID)
  .maybeSingle();

console.log("\n=== BOOK REPLY RUN ===");
console.log(JSON.stringify({
  id: run?.id,
  status: run?.status,
  current_node_id: run?.current_node_id,
  variables: run?.variables,
}, null, 2));

console.log("\n=== SESSION ===");
console.log(JSON.stringify(session, null, 2));
