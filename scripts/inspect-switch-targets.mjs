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
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ids = ["04f805f8-085a-4d1e-bcc7-8f9228ee1ff8", "dab15807-9a9a-41e1-b8c5-15c6e40a7a80", "c3d26feb-d999-421e-a676-6ec895126c72"];
const { data: nodes } = await sb.from("automation_nodes").select("*").in("id", ids);
console.log(JSON.stringify(nodes?.map((n) => ({ id: n.id, action: n.config?.action, message: n.config?.message, title: n.config?.title, body: n.config?.body, prompt: n.config?.prompt })), null, 2));
