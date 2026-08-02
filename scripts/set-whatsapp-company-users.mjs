import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const whatsappCompany = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const browserCompany = "d0000010-0001-4001-8001-000000000002";

const { data: profiles } = await sb
  .from("profiles")
  .select("id, email, company_id")
  .in("company_id", [browserCompany, whatsappCompany]);

console.log("profiles", JSON.stringify(profiles, null, 2));

const demoEmails = ["demo-platform@vaultos.local", "demo-beta-admin@vaultos.local"];
for (const email of demoEmails) {
  const { data: user } = await sb.auth.admin.listUsers();
  const u = user.users.find((x) => x.email === email);
  if (u) {
    await sb.from("profiles").update({ company_id: whatsappCompany }).eq("id", u.id);
    console.log("updated", email, u.id, "->", whatsappCompany);
  }
}
