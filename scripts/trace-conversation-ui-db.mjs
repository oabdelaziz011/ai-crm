/**
 * Compare UI read tables vs inbound write tables for WhatsApp channel
 */
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

const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const INBOUND_ID = "ad0b1961-31a2-46a2-9268-905cff261ec0";

const { data: channel } = await sb.from("company_channels").select("id, company_id, display_name").eq("id", CHANNEL_ID).single();
const companyId = channel.company_id;

console.log("=== CHANNEL ===", channel);

const { data: inbound } = await sb.from("channel_inbound_events").select("*").eq("id", INBOUND_ID).single();
console.log("\n=== INBOUND ad0b1961 ===");
console.log(JSON.stringify({
  conversation_id: inbound.conversation_id,
  channel_session_id: inbound.channel_session_id,
  processing_status: inbound.processing_status,
  incoming_message_id: inbound.incoming_message_id,
}, null, 2));

const { data: convs } = await sb
  .from("conversations")
  .select("id, company_id, channel_type, external_thread_id, company_channel_id, state, last_message_at, last_message_preview, unread_count_employee, deleted_at, ai_assistant_id")
  .eq("company_id", companyId)
  .eq("channel_type", "whatsapp")
  .is("deleted_at", null)
  .order("last_message_at", { ascending: false, nullsFirst: false })
  .limit(10);

console.log("\n=== CONVERSATIONS (whatsapp) ===", convs?.length);
for (const c of convs ?? []) {
  console.log(JSON.stringify({
    id: c.id,
    external_thread_id: c.external_thread_id,
    company_channel_id: c.company_channel_id,
    state: c.state,
    last_message_at: c.last_message_at,
    preview: c.last_message_preview?.slice(0, 50),
    unread: c.unread_count_employee,
  }));
}

if (inbound.conversation_id) {
  const { data: conv } = await sb.from("conversations").select("*").eq("id", inbound.conversation_id).single();
  console.log("\n=== LINKED CONVERSATION ===");
  console.log(JSON.stringify({
    id: conv.id,
    company_id: conv.company_id,
    channel_type: conv.channel_type,
    external_thread_id: conv.external_thread_id,
    deleted_at: conv.deleted_at,
    last_message_at: conv.last_message_at,
  }, null, 2));

  const { data: msgs, count } = await sb
    .from("conversation_messages")
    .select("id, direction, content, created_at, message_type", { count: "exact" })
    .eq("conversation_id", inbound.conversation_id)
    .order("created_at", { ascending: false })
    .limit(8);

  console.log("\n=== MESSAGES for linked conversation ===", count);
  for (const m of msgs ?? []) {
    console.log(JSON.stringify({
      created_at: m.created_at,
      direction: m.direction,
      content: m.content?.slice(0, 60),
      type: m.message_type,
    }));
  }
}

const { count: totalInbounds } = await sb
  .from("channel_inbound_events")
  .select("*", { count: "exact", head: true })
  .eq("company_channel_id", CHANNEL_ID)
  .gte("created_at", "2026-07-24T04:00:00Z");

const { count: withConv } = await sb
  .from("channel_inbound_events")
  .select("*", { count: "exact", head: true })
  .eq("company_channel_id", CHANNEL_ID)
  .gte("created_at", "2026-07-24T04:00:00Z")
  .not("conversation_id", "is", null);

const { count: withMsg } = await sb
  .from("channel_inbound_events")
  .select("*", { count: "exact", head: true })
  .eq("company_channel_id", CHANNEL_ID)
  .gte("created_at", "2026-07-24T04:00:00Z")
  .not("incoming_message_id", "is", null);

console.log("\n=== INBOUND LINKAGE (since 04:00) ===", { totalInbounds, withConv, withMsg });

const { data: uiQuery } = await sb
  .from("conversations")
  .select("id, last_message_at, channel_type, external_thread_id")
  .eq("company_id", companyId)
  .is("deleted_at", null)
  .order("last_message_at", { ascending: false, nullsFirst: false })
  .limit(100);

console.log("\n=== UI-EQUIVALENT LIST (service role) ===", uiQuery?.length);
console.log("whatsapp subset:", uiQuery?.filter((c) => c.channel_type === "whatsapp").length);
