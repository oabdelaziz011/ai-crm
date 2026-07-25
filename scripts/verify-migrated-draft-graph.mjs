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
const BUTTONS_NODE = "991d1d70-7ec1-42e0-8cb5-1516a4f387ad";
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { count: draftNodes } = await sb.from("automation_nodes").select("*", { count: "exact", head: true }).eq("flow_id", FLOW_ID);
const { count: draftEdges } = await sb.from("automation_edges").select("*", { count: "exact", head: true }).eq("flow_id", FLOW_ID);
const { data: buttonOutgoing } = await sb.from("automation_edges").select("*").eq("flow_id", FLOW_ID).eq("source_node_id", BUTTONS_NODE);
const switchTargetId = buttonOutgoing?.[0]?.target_node_id;
const { data: switchNode } = switchTargetId
  ? await sb.from("automation_nodes").select("*").eq("id", switchTargetId).single()
  : { data: null };
const { data: switchOutgoing } = switchTargetId
  ? await sb.from("automation_edges").select("*").eq("flow_id", FLOW_ID).eq("source_node_id", switchTargetId)
  : { data: [] };

console.log(
  JSON.stringify(
    {
      draftNodes,
      draftEdges,
      buttonsOutgoingCount: buttonOutgoing?.length ?? 0,
      buttonsRoutesToSwitch: switchNode?.config?.mode === "switch",
      switchField: switchNode?.config?.field,
      switchCaseCount: Array.isArray(switchNode?.config?.cases) ? switchNode.config.cases.length : 0,
      switchWiredCases: (switchOutgoing ?? []).map((edge) => ({
        case: edge.condition?.case,
        target: edge.target_node_id,
      })),
    },
    null,
    2,
  ),
);
