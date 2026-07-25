import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const convId = "9b1b2e8f-f6ae-4f4d-9897-cc2a910509ac";
const companyId = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";

const { data: msgs } = await sb
  .from("conversation_messages")
  .select("id, message_type, content, created_at")
  .eq("conversation_id", convId)
  .order("created_at", { ascending: false })
  .limit(5);
console.log("recent messages:", msgs);

const { count: incoming } = await sb
  .from("conversation_messages")
  .select("*", { count: "exact", head: true })
  .eq("conversation_id", convId)
  .eq("message_type", "incoming");
const { count: outgoing } = await sb
  .from("conversation_messages")
  .select("*", { count: "exact", head: true })
  .eq("conversation_id", convId)
  .eq("message_type", "outgoing");
console.log("incoming:", incoming, "outgoing:", outgoing);

const { data: prof, error: profErr } = await sb.from("profiles").select("id, company_id, full_name, is_super_admin").limit(5);
console.log("profiles error:", profErr);
console.log("profiles sample:", prof);

const { data: companyProfiles } = await sb
  .from("profiles")
  .select("id, company_id, full_name, is_super_admin")
  .eq("company_id", companyId);
console.log("company profiles count:", companyProfiles?.length);

for (const p of companyProfiles ?? []) {
  const { data: userRoles } = await sb.from("user_roles").select("role_id").eq("user_id", p.id);
  const roleIds = (userRoles ?? []).map((r) => r.role_id);
  let codes = [];
  if (roleIds.length) {
    const { data: rp } = await sb.from("role_permissions").select("permission_id, permissions(code)").in("role_id", roleIds);
    codes = (rp ?? []).map((r) => r.permissions?.code).filter(Boolean);
  }
  console.log(`User ${p.full_name} (${p.id}): ai.conversations.view=${codes.includes("ai.conversations.view")}, super=${p.is_super_admin}`);
}

// Roles that include ai.conversations.view
const { data: permRow } = await sb.from("permissions").select("id").eq("code", "ai.conversations.view").single();
if (permRow) {
  const { data: rolesWithPerm } = await sb.from("role_permissions").select("role_id, roles(name)").eq("permission_id", permRow.id);
  console.log("\nRoles with ai.conversations.view:", rolesWithPerm?.map((r) => r.roles?.name));
}
