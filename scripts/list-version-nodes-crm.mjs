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

const { data: versionNodes, error } = await sb.from("automation_flow_version_nodes").select("*").eq("flow_version_id", flow.active_version_id);
console.log("version node count:", versionNodes?.length, error?.message);

for (const n of versionNodes ?? []) {
  const cfg = typeof n.config === "string" ? JSON.parse(n.config) : n.config;
  const action = cfg?.action ?? cfg?.builderType;
  if (String(action ?? "").includes("book") || String(action ?? "").includes("customer") || cfg?.inputKey) {
    console.log(JSON.stringify({ id: n.id, label: n.label, type: n.type, action, inputKey: cfg?.inputKey, config: cfg }, null, 2));
  }
}
