/**
 * End-to-end trace for the most recent WhatsApp inbound message.
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

const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const PAGE_SIZE = 50;
const PERSONAL_SENDERS = ["201023169075", "+201023169075"];

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function section(title) {
  console.log(`\n=== ${title} ===`);
}

// Latest inbound events for WhatsApp channel (last 15 min + top 5 overall)
const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();

const { data: recentEvents } = await sb
  .from("channel_inbound_events")
  .select("*")
  .eq("company_channel_id", CHANNEL_ID)
  .gte("created_at", since)
  .order("created_at", { ascending: false })
  .limit(10);

section(`channel_inbound_events (last 30m, channel ${CHANNEL_ID})`);
console.log("count:", recentEvents?.length ?? 0);
for (const e of recentEvents ?? []) {
  const text =
    e.payload?.message?.text?.body ??
    e.payload?.message?.interactive?.button_reply?.title ??
    e.payload?.message?.interactive?.list_reply?.title ??
    null;
  console.log(
    JSON.stringify({
      id: e.id,
      created_at: e.created_at,
      processing_status: e.processing_status,
      error_message: e.error_message,
      sender_external_id: e.sender_external_id,
      external_message_id: e.external_message_id,
      conversation_id: e.conversation_id,
      channel_session_id: e.channel_session_id,
      incoming_message_id: e.incoming_message_id,
      message_type: e.payload?.message?.type ?? null,
      text_preview: text,
    }),
  );
}

const focus =
  recentEvents?.find((e) => PERSONAL_SENDERS.some((s) => e.sender_external_id?.includes("201023169075"))) ??
  recentEvents?.[0] ??
  null;

if (!focus) {
  const { data: latest } = await sb
    .from("channel_inbound_events")
    .select("*")
    .eq("company_channel_id", CHANNEL_ID)
    .order("created_at", { ascending: false })
    .limit(3);
  section("FALLBACK: latest 3 inbound events (any time)");
  for (const e of latest ?? []) {
    console.log(JSON.stringify({ id: e.id, created_at: e.created_at, sender: e.sender_external_id, status: e.processing_status }));
  }
  process.exit(0);
}

section("FOCUS inbound event");
console.log(JSON.stringify({ id: focus.id, created_at: focus.created_at, conversation_id: focus.conversation_id }));

const convId = focus.conversation_id;
const incomingMsgId = focus.incoming_message_id;
const sessionId = focus.channel_session_id;

if (incomingMsgId) {
  const { data: msg } = await sb.from("conversation_messages").select("*").eq("id", incomingMsgId).maybeSingle();
  section("conversation_messages (incoming_message_id from inbound event)");
  console.log(
    msg
      ? JSON.stringify({
          id: msg.id,
          conversation_id: msg.conversation_id,
          created_at: msg.created_at,
          content: msg.content?.slice(0, 120),
          message_type: msg.message_type,
          external_message_id: msg.external_message_id,
        })
      : "NOT FOUND",
  );
} else {
  section("conversation_messages");
  console.log("incoming_message_id is NULL on inbound event — no linked message row");
}

if (convId) {
  const { data: conv } = await sb.from("conversations").select("*").eq("id", convId).maybeSingle();
  section("conversations row");
  console.log(
    conv
      ? JSON.stringify({
          id: conv.id,
          conversation_number: conv.conversation_number,
          last_message_at: conv.last_message_at,
          last_message_preview: conv.last_message_preview,
          updated_at: conv.updated_at,
          state: conv.state,
          unread_count_employee: conv.unread_count_employee,
        })
      : "NOT FOUND",
  );

  const { data: msgsNear } = await sb
    .from("conversation_messages")
    .select("id, created_at, content, message_type")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: false })
    .limit(5);
  section("Latest 5 conversation_messages for conversation");
  for (const m of msgsNear ?? []) {
    console.log(JSON.stringify({ id: m.id, created_at: m.created_at, type: m.message_type, content: (m.content || "").slice(0, 80) }));
  }
}

if (sessionId) {
  const { data: sess } = await sb.from("channel_sessions").select("*").eq("id", sessionId).maybeSingle();
  section("channel_sessions row");
  console.log(
    sess
      ? JSON.stringify({
          id: sess.id,
          conversation_id: sess.conversation_id,
          last_inbound_at: sess.last_inbound_at,
          last_outbound_at: sess.last_outbound_at,
          updated_at: sess.updated_at,
          external_thread_id: sess.external_thread_id,
        })
      : "NOT FOUND",
  );
}

section("listConversations() equivalent query (page 0, limit 50)");
const { data: listRows } = await sb
  .from("conversations")
  .select("id, conversation_number, last_message_at, channel_type, deleted_at")
  .eq("company_id", COMPANY_ID)
  .is("deleted_at", null)
  .order("last_message_at", { ascending: false, nullsFirst: false })
  .order("created_at", { ascending: false })
  .range(0, PAGE_SIZE - 1);

const rank = listRows?.findIndex((r) => r.id === convId) ?? -1;
console.log("total_rows:", listRows?.length ?? 0);
console.log("focus_conversation_rank:", rank >= 0 ? rank + 1 : "NOT IN PAGE 0");
console.log("focus_in_list:", rank >= 0);
if (rank >= 0) {
  console.log("matched_row:", JSON.stringify(listRows[rank]));
}
console.log("first_5:", listRows?.slice(0, 5).map((r) => ({ num: r.conversation_number, id: r.id, last_message_at: r.last_message_at })));

// Compare inbound created_at vs conversation last_message_at
if (convId) {
  const { data: conv } = await sb.from("conversations").select("last_message_at, updated_at").eq("id", convId).maybeSingle();
  section("TIMING COMPARISON");
  console.log(
    JSON.stringify({
      inbound_event_created_at: focus.created_at,
      inbound_processed_at: focus.processed_at ?? null,
      conversation_last_message_at: conv?.last_message_at ?? null,
      conversation_updated_at: conv?.updated_at ?? null,
      last_message_at_after_inbound:
        conv?.last_message_at && focus.created_at
          ? Date.parse(conv.last_message_at) >= Date.parse(focus.created_at)
          : null,
    }),
  );
}
