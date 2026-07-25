/**
 * Investigate Book Appointment routing bug — live DB trace.
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
const WA_CONV = "a35d7fff-cac7-47f3-9604-df683e726b71";

// 1. Find Book Appointment inbound replies
const { data: msgs } = await sb
  .from("conversation_messages")
  .select("id, content, metadata, created_at, message_type")
  .eq("conversation_id", WA_CONV)
  .eq("message_type", "incoming")
  .order("created_at", { ascending: true });

const bookReplies = (msgs ?? []).filter(
  (m) =>
    m.metadata?.replyId === "book" ||
    m.content === "Book Appointment" ||
    m.metadata?.title === "Book Appointment",
);

console.log("=== BOOK APPOINTMENT INBOUND REPLIES ===");
console.log(JSON.stringify(bookReplies, null, 2));

// 2. Find outbound support message
const { data: supportOut } = await sb
  .from("conversation_messages")
  .select("id, content, metadata, created_at")
  .eq("conversation_id", WA_CONV)
  .eq("message_type", "outgoing")
  .ilike("content", "%19666%")
  .order("created_at", { ascending: false })
  .limit(5);

console.log("\n=== SUPPORT OUTBOUND (19666) ===");
console.log(JSON.stringify(supportOut, null, 2));

// 3. Automation runs for this conversation
const { data: conv } = await sb
  .from("conversations")
  .select("id, external_thread_id, company_channel_id, metadata")
  .eq("id", WA_CONV)
  .single();

console.log("\n=== CONVERSATION ===");
console.log(JSON.stringify(conv, null, 2));

const { data: sessions } = await sb
  .from("conversation_sessions")
  .select("*")
  .eq("conversation_id", WA_CONV)
  .order("updated_at", { ascending: false })
  .limit(5);

console.log("\n=== SESSIONS ===");
for (const s of sessions ?? []) {
  console.log({
    id: s.id,
    status: s.status,
    current_node_id: s.current_node_id,
    automation_run_id: s.automation_run_id,
    variables: s.variables,
    updated_at: s.updated_at,
  });
}

const runIds = [...new Set((sessions ?? []).map((s) => s.automation_run_id).filter(Boolean))];
for (const runId of runIds.slice(0, 3)) {
  const { data: run } = await sb.from("automation_runs").select("*").eq("id", runId).single();
  console.log("\n=== AUTOMATION RUN", runId, "===");
  console.log({
    status: run?.status,
    current_node_id: run?.current_node_id,
    flow_version_id: run?.flow_version_id,
    variables: run?.variables,
    updated_at: run?.updated_at,
  });
}

// 4. Channel inbound events for book replies
for (const reply of bookReplies.slice(-2)) {
  const ts = reply.created_at;
  const { data: inbounds } = await sb
    .from("channel_inbound_events")
    .select("id, payload, created_at, processing_status")
    .gte("created_at", new Date(new Date(ts).getTime() - 60000).toISOString())
    .lte("created_at", new Date(new Date(ts).getTime() + 60000).toISOString())
    .order("created_at", { ascending: true });

  const match = (inbounds ?? []).find((e) => {
    const msg = e.payload?.message;
    const rid = msg?.interactive?.button_reply?.id ?? msg?.interactive?.list_reply?.id;
    const title = msg?.interactive?.button_reply?.title ?? msg?.interactive?.list_reply?.title;
    return rid === "book" || title === "Book Appointment";
  });

  console.log("\n=== INBOUND EVENT for reply", reply.id, "===");
  if (match) {
    const msg = match.payload?.message;
    console.log({
      eventId: match.id,
      replyId: msg?.interactive?.button_reply?.id ?? msg?.interactive?.list_reply?.id,
      title: msg?.interactive?.button_reply?.title ?? msg?.interactive?.list_reply?.title,
      interactionType: msg?.interactive?.type,
      rawButtonReply: msg?.interactive?.button_reply,
      processing_status: match.processing_status,
    });
  } else {
    console.log("no matching channel_inbound_events in window");
  }
}
