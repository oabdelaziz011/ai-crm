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
const companyId = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";

const { data: profiles } = await sb
  .from("profiles")
  .select("id, email, full_name, company_id")
  .eq("company_id", companyId)
  .limit(10);

console.log("profiles:", JSON.stringify(profiles, null, 2));

const { data: users } = await sb.auth.admin.listUsers({ perPage: 50 });
const companyUsers = users.users.filter((u) => profiles?.some((p) => p.id === u.id));
for (const u of companyUsers) {
  console.log("auth user:", u.email, u.id);
}
