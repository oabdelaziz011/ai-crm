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

const { data: signIn, error } = await sb.auth.signInWithPassword({
  email: "demo-platform@vaultos.local",
  password: "DemoVault2026!",
});

if (error) {
  console.error("signIn failed", error.message);
  process.exit(1);
}

const userId = signIn.user?.id;
const { data: profile } = await sb.from("profiles").select("*").eq("id", userId).single();
console.log("profile:", JSON.stringify({ email: profile?.email, company_id: profile?.company_id, is_super_admin: profile?.is_super_admin }, null, 2));

const companyId = profile?.company_id;
const client = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${signIn.session?.access_token}` } },
});

const { data: convs, error: convErr } = await client
  .from("conversations")
  .select("id, conversation_number, channel_type, last_message_at")
  .eq("company_id", companyId)
  .order("last_message_at", { ascending: false })
  .limit(10);

console.log("conversations error:", convErr?.message ?? null);
console.log("conversations:", JSON.stringify(convs, null, 2));

const { data: hasPerm } = await client.rpc("company_has_permission", {
  p_company_id: companyId,
  p_permission: "ai.conversations.view",
});

console.log("has ai.conversations.view:", hasPerm);
