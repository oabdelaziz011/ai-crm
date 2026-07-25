import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

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
const SWITCH_NODE = "175766de-17f0-47c0-97e8-9f45b8fee90c";
const SUPPORT_TARGET = "c3d26feb-d999-421e-a676-6ec895126c72";
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: edges } = await sb.from("automation_edges").select("*").eq("flow_id", FLOW_ID).eq("source_node_id", SWITCH_NODE);
const hasSupport = edges?.some((e) => e.condition?.case === "support");
if (hasSupport) {
  console.log("Support case already wired.");
  process.exit(0);
}

const { error } = await sb.from("automation_edges").insert({
  id: randomUUID(),
  flow_id: FLOW_ID,
  source_node_id: SWITCH_NODE,
  target_node_id: SUPPORT_TARGET,
  condition: { case: "support", label: "Talk to Support" },
});
if (error) {
  console.error("Failed to wire support case:", error.message);
  process.exit(1);
}

await sb.from("automation_flows").update({ has_unpublished_draft: true, updated_at: new Date().toISOString() }).eq("id", FLOW_ID);
console.log(JSON.stringify({ wired: true, switchNodeId: SWITCH_NODE, supportTarget: SUPPORT_TARGET }, null, 2));
