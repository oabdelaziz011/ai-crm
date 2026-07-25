/**
 * Live investigation: CNV-000010 automation outbound persistence
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

const CNV = "CNV-000010";

const { data: convs, error: convErr } = await sb
  .from("conversations")
  .select("*")
  .eq("conversation_number", CNV)
  .is("deleted_at", null)
  .order("last_message_at", { ascending: false });

console.log("=== CONVERSATIONS matching", CNV, "count:", convs?.length, "===");
console.log("error:", convErr);
for (const c of convs ?? []) {
  console.log(JSON.stringify({
    id: c.id,
    company_id: c.company_id,
    channel_type: c.channel_type,
    company_channel_id: c.company_channel_id,
    last_message_at: c.last_message_at,
    preview: c.last_message_preview?.slice(0, 60),
  }));
}

const conv = convs?.[0];

if (!conv) {
  console.log("Conversation not found");
  process.exit(1);
}

const convId = conv.id;

const { data: msgs, count: msgCount } = await sb
  .from("conversation_messages")
  .select("id, message_type, content, created_at, metadata, external_message_id, sequence_number", { count: "exact" })
  .eq("conversation_id", convId)
  .order("created_at", { ascending: true });

console.log("\n=== conversation_messages (total:", msgCount, ") ===");
const incoming = (msgs ?? []).filter((m) => m.message_type === "incoming");
const outgoing = (msgs ?? []).filter((m) => m.message_type === "outgoing");
console.log("incoming:", incoming.length, "outgoing:", outgoing.length);
for (const m of msgs ?? []) {
  console.log(JSON.stringify({
    id: m.id,
    message_type: m.message_type,
    content: m.content?.slice(0, 80),
    created_at: m.created_at,
    seq: m.sequence_number,
    metaKeys: m.metadata ? Object.keys(m.metadata) : [],
    automationRunId: m.metadata?.automationRunId,
    correlationId: m.metadata?.correlationId,
  }));
}

const { data: deliveries, count: delCount } = await sb
  .from("channel_delivery_events")
  .select("id, delivery_status, outbound_message_id, created_at, payload, external_message_id, sent_at", { count: "exact" })
  .eq("conversation_id", convId)
  .order("created_at", { ascending: true });

console.log("\n=== channel_delivery_events (total:", delCount, ") ===");
let nullOutbound = 0;
let linkedOutbound = 0;
for (const d of deliveries ?? []) {
  if (d.outbound_message_id) linkedOutbound++;
  else nullOutbound++;
  console.log(JSON.stringify({
    id: d.id,
    status: d.delivery_status,
    outbound_message_id: d.outbound_message_id,
    created_at: d.created_at,
    text: d.payload?.text?.slice?.(0, 60),
    sent_at: d.sent_at,
    external_message_id: d.external_message_id,
  }));
}
console.log("outbound_message_id NULL:", nullOutbound, "linked:", linkedOutbound);

const { data: inbounds } = await sb
  .from("channel_inbound_events")
  .select("id, created_at, processing_status, incoming_message_id, conversation_id")
  .eq("conversation_id", convId)
  .order("created_at", { ascending: false })
  .limit(15);

console.log("\n=== recent channel_inbound_events ===", inbounds?.length);
for (const i of inbounds ?? []) {
  console.log(JSON.stringify(i));
}

// Recent deliveries after fix timestamp (approx today)
const { data: recentDel } = await sb
  .from("channel_delivery_events")
  .select("id, outbound_message_id, created_at, payload")
  .eq("conversation_id", convId)
  .gte("created_at", "2026-07-24T18:00:00Z")
  .order("created_at", { ascending: false })
  .limit(10);

console.log("\n=== deliveries since 18:00 UTC ===", recentDel?.length);
for (const d of recentDel ?? []) {
  console.log(JSON.stringify({
    id: d.id,
    outbound_message_id: d.outbound_message_id,
    created_at: d.created_at,
    text: d.payload?.text?.slice?.(0, 50),
  }));
}
