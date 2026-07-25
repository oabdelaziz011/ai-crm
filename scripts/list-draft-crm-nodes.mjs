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
const { data: nodes } = await sb.from("automation_nodes").select("id,config,label").eq("flow_id", FLOW);
for (const n of nodes ?? []) {
  const s = JSON.stringify(n.config ?? {});
  if (s.includes("find_customer") || s.includes("customer_phone") || s.includes("create_customer")) {
    console.log(JSON.stringify(n, null, 2));
  }
}
