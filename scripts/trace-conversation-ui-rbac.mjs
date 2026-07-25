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

const { count, error: msgErr } = await sb.from("conversation_messages").select("*", { count: "exact", head: true }).eq("conversation_id", convId);
console.log("msg count", count, msgErr);

const { data: msgSample } = await sb.from("conversation_messages").select("id, direction, content, created_at").eq("conversation_id", convId).order("created_at", { ascending: false }).limit(3);
console.log("msg sample", msgSample);

const { data: permDef } = await sb.from("permissions").select("code").ilike("code", "%conversation%");
console.log("conversation permissions", permDef);

const { data: profiles } = await sb.from("profiles").select("id, user_id, company_id, email, role_id").eq("company_id", companyId).limit(5);
console.log("profiles", profiles);

for (const p of profiles ?? []) {
  const { data: userRoles } = await sb.from("user_roles").select("role_id, roles(name)").eq("user_id", p.user_id);
  const roleIds = (userRoles ?? []).map((r) => r.role_id).filter(Boolean);
  let rolePerms = [];
  if (roleIds.length) {
    const { data: rp } = await sb.from("role_permissions").select("permissions(code)").in("role_id", roleIds);
    rolePerms = (rp ?? []).map((r) => r.permissions?.code).filter(Boolean);
  }
  const { data: up } = await sb.from("user_permissions").select("permissions(code)").eq("user_id", p.user_id);
  const userPerms = (up ?? []).map((r) => r.permissions?.code).filter(Boolean);
  const all = [...new Set([...rolePerms, ...userPerms])];
  console.log(`\nUser ${p.email}: roles=${JSON.stringify(userRoles?.map((r) => r.roles?.name))}`);
  console.log("  has ai.conversations.view:", all.includes("ai.conversations.view"));
  console.log("  conversation perms:", all.filter((c) => c?.includes("conversation")));
}

// Outbound messages in delivery events only
const { count: deliveryCount } = await sb.from("channel_delivery_events").select("*", { count: "exact", head: true }).eq("conversation_id", convId);
console.log("\ndelivery events for conv:", deliveryCount);

// Check conversation_messages for outbound
const { count: outboundMsgCount } = await sb.from("conversation_messages").select("*", { count: "exact", head: true }).eq("conversation_id", convId).eq("direction", "outbound");
const { count: inboundMsgCount } = await sb.from("conversation_messages").select("*", { count: "exact", head: true }).eq("conversation_id", convId).eq("direction", "inbound");
console.log("inbound msgs:", inboundMsgCount, "outbound msgs:", outboundMsgCount);
