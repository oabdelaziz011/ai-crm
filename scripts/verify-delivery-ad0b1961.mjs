/**
 * Full delivery verification for inbound ad0b1961
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

const INBOUND_ID = "ad0b1961-31a2-46a2-9268-905cff261ec0";
const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";

const { data: inbound } = await sb
  .from("channel_inbound_events")
  .select("*")
  .eq("id", INBOUND_ID)
  .single();

const { data: deliveries } = await sb
  .from("channel_delivery_events")
  .select("*")
  .eq("company_channel_id", CHANNEL_ID)
  .gte("created_at", "2026-07-24T04:37:40Z")
  .lte("created_at", "2026-07-24T04:38:00Z")
  .order("created_at", { ascending: true });

const correlated = (deliveries ?? []).filter(
  (d) => d.payload?.metadata?.correlationId === INBOUND_ID || d.payload?.correlationId === INBOUND_ID,
);

console.log("=== INBOUND ===");
console.log(JSON.stringify({
  id: inbound.id,
  created_at: inbound.created_at,
  sender_external_id: inbound.sender_external_id,
  external_thread_id: inbound.external_thread_id,
}, null, 2));

console.log("\n=== CORRELATED DELIVERY EVENTS ===", correlated.length);
for (const d of correlated) {
  console.log("\n--- delivery", d.id, "---");
  console.log(JSON.stringify({
    created_at: d.created_at,
    delivery_status: d.delivery_status,
    external_message_id: d.external_message_id,
    external_thread_id: d.external_thread_id,
    sent_at: d.sent_at,
    delivered_at: d.delivered_at,
    read_at: d.read_at,
    failed_at: d.failed_at,
    error_message: d.error_message,
    attempt_count: d.attempt_count,
    payload: d.payload,
    provider_response: d.provider_response,
  }, null, 2));
}

// Channel config for phone_number_id
const { data: channel } = await sb
  .from("company_channels")
  .select("id, name, config, provider_config")
  .eq("id", CHANNEL_ID)
  .single();

console.log("\n=== CHANNEL CONFIG (phone_number_id) ===");
const cfg = channel?.config ?? channel?.provider_config ?? {};
console.log(JSON.stringify({
  channelName: channel?.name,
  phone_number_id: cfg.phone_number_id ?? cfg.phoneNumberId ?? cfg.meta?.phone_number_id,
  waba_id: cfg.waba_id ?? cfg.businessAccountId,
  keys: Object.keys(cfg),
}, null, 2));

// Status webhooks - channel_inbound_events won't have these; check if stored elsewhere
// Look for delivery status updates on same external_message_id
const wamids = correlated.map((d) => d.external_message_id).filter(Boolean);
console.log("\n=== WAMIDs TO TRACE ===", wamids);

for (const wamid of wamids) {
  const { data: statusUpdates } = await sb
    .from("channel_delivery_events")
    .select("id, created_at, delivery_status, external_message_id, provider_response, updated_at")
    .eq("company_channel_id", CHANNEL_ID)
    .eq("external_message_id", wamid);

  console.log("\n--- status history for wamid", wamid, "---");
  console.log(JSON.stringify(statusUpdates, null, 2));
}

// Search provider_response across all deliveries for graph request/response patterns
console.log("\n=== RAW provider_response keys (first delivery) ===");
if (correlated[0]) {
  console.log(JSON.stringify(Object.keys(correlated[0].provider_response ?? {}), null, 2));
  console.log(JSON.stringify(correlated[0].provider_response, null, 2));
}
