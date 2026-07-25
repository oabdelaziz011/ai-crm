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

const { data: nodes } = await sb.from("automation_nodes").select("*").eq("flow_id", FLOW_ID);
const { data: edges } = await sb.from("automation_edges").select("*").eq("flow_id", FLOW_ID);

const buttonsEdge = edges?.find((e) => e.source_node_id === BUTTONS_NODE);
const switchNode = nodes?.find((n) => n.id === buttonsEdge?.target_node_id);
const switchOutgoing = edges?.filter((e) => e.source_node_id === switchNode?.id) ?? [];

const nodeById = Object.fromEntries((nodes ?? []).map((n) => [n.id, n]));

console.log(JSON.stringify({
  switchNodeId: switchNode?.id,
  switchCases: switchNode?.config?.cases,
  switchOutgoing: switchOutgoing.map((e) => ({
    case: e.condition?.case,
    target: e.target_node_id,
    targetAction: nodeById[e.target_node_id]?.config?.action,
    targetMessage: nodeById[e.target_node_id]?.config?.message?.slice?.(0, 80),
  })),
  supportCandidates: (nodes ?? []).filter((n) => String(n.config?.message ?? "").includes("19666")).map((n) => ({
    id: n.id,
    message: n.config?.message,
  })),
  bookCandidates: (nodes ?? []).filter((n) => String(n.config?.message ?? "").toLowerCase().includes("phone")).map((n) => ({
    id: n.id,
    action: n.config?.action,
    message: n.config?.message,
  })),
}, null, 2));
