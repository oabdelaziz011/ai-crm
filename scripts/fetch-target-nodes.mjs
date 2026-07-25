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
const ids = ["04f805f8-085a-4d1e-bcc7-8f9228ee1ff8", "c3d26feb-d999-421e-a676-6ec895126c72"];
for (const id of ids) {
  const { data } = await sb.from("automation_flow_version_nodes").select("*").eq("id", id).single();
  console.log(JSON.stringify({ id, type: data.type, action: data.config?.action, label: data.label, config: data.config }, null, 2));
}
