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
const action = process.argv[2] ?? "set";
const platformUserId = "d0000001-0001-4001-8001-000000000001";
const whatsappCompanyId = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";

if (action === "set") {
  const { error } = await sb.from("profiles").update({ company_id: whatsappCompanyId }).eq("id", platformUserId);
  if (error) throw error;
  console.log("set company scope ok");
} else {
  const { error } = await sb.from("profiles").update({ company_id: null }).eq("id", platformUserId);
  if (error) throw error;
  console.log("reverted company scope ok");
}
