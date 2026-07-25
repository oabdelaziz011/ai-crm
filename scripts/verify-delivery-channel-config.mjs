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

const { data: channel, error } = await sb.from("company_channels").select("*").eq("id", CHANNEL_ID).single();
console.log("error", error?.message);
console.log("columns", channel ? Object.keys(channel) : null);
console.log("configuration", JSON.stringify(channel?.configuration, null, 2));
console.log("metadata", JSON.stringify(channel?.metadata, null, 2));

// conversation_messages for outbound linked to deliveries
const { data: deliveries } = await sb
  .from("channel_delivery_events")
  .select("id, outbound_message_id, external_message_id, sent_at, created_at")
  .in("id", ["c646f4a6-3d8d-4f78-897d-9cb27c76c611", "e896bc3c-52df-4730-b6d7-7254918d3865"]);

console.log("\ndeliveries", JSON.stringify(deliveries, null, 2));

// Timeline: sent_at vs created_at vs status webhook
for (const id of ["c646f4a6-3d8d-4f78-897d-9cb27c76c611", "e896bc3c-52df-4730-b6d7-7254918d3865"]) {
  const { data: d } = await sb.from("channel_delivery_events").select("*").eq("id", id).single();
  console.log("\n=== TIMELINE", id.slice(0, 8), "===");
  console.log(JSON.stringify({
    created_at: d.created_at,
    sent_at: d.sent_at,
    delivered_at: d.delivered_at,
    read_at: d.read_at,
    delivery_status: d.delivery_status,
    external_message_id: d.external_message_id,
    attempt_count: d.attempt_count,
    error_message: d.error_message,
  }, null, 2));
}

// Check delivery status pipeline - any inbound status events stored?
// Search conversation_messages metadata
if (deliveries?.[0]?.outbound_message_id) {
  const { data: msg } = await sb.from("conversation_messages").select("*").eq("id", deliveries[0].outbound_message_id).maybeSingle();
  console.log("\noutbound conversation_message", JSON.stringify(msg, null, 2));
}
