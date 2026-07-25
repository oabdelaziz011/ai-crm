/**
 * Verify automation outbound persistence after bundle restart.
 * 1. POST synthetic WhatsApp inbound to local API
 * 2. Assert conversation_messages outgoing rows + channel_delivery_events linkage
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

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
const WA_USER = "201023169075";
const API_BASE = (env.VITE_API_SERVER_URL || "http://localhost:3000").replace(/\/$/, "");
const MARKER = `verify-outbound-${Date.now()}`;

const { data: channel, error: chErr } = await sb
  .from("company_channels")
  .select("id, configuration, company_id")
  .eq("id", CHANNEL_ID)
  .single();

if (chErr || !channel) {
  console.error("Channel lookup failed:", chErr?.message ?? "not found");
  process.exit(1);
}

const phoneNumberId = channel.configuration?.phoneNumberId;
if (!phoneNumberId) {
  console.error("Missing phoneNumberId on channel");
  process.exit(1);
}

const wamid = `wamid.verify.${randomUUID()}`;
const payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_VERIFY",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "15550000000",
              phone_number_id: phoneNumberId,
            },
            contacts: [{ profile: { name: "Verify Bot" }, wa_id: WA_USER }],
            messages: [
              {
                from: WA_USER,
                id: wamid,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: MARKER },
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

console.log("=== PRE-FLIGHT ===");
console.log("API:", `${API_BASE}/api/webhooks/whatsapp`);
console.log("channel:", CHANNEL_ID);
console.log("phoneNumberId:", phoneNumberId);
console.log("marker:", MARKER);
console.log("wamid:", wamid);

const beforeInbound = await sb
  .from("channel_inbound_events")
  .select("id", { count: "exact", head: true })
  .eq("company_channel_id", CHANNEL_ID);

console.log("inbound events before:", beforeInbound.count);

const response = await fetch(`${API_BASE}/api/webhooks/whatsapp`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

const responseText = await response.text();
let responseJson;
try {
  responseJson = JSON.parse(responseText);
} catch {
  responseJson = { raw: responseText.slice(0, 500) };
}

console.log("\n=== WEBHOOK RESPONSE ===");
console.log("status:", response.status);
console.log(JSON.stringify(responseJson, null, 2));

if (!response.ok) {
  console.error("Webhook POST failed");
  process.exit(1);
}

await new Promise((r) => setTimeout(r, 3000));

const { data: inbound } = await sb
  .from("channel_inbound_events")
  .select("id, processing_status, error_message, conversation_id, created_at")
  .eq("external_message_id", wamid)
  .maybeSingle();

console.log("\n=== INBOUND EVENT ===");
console.log(JSON.stringify(inbound, null, 2));

if (!inbound?.conversation_id) {
  console.error("No conversation_id on inbound event");
  process.exit(1);
}

const convId = inbound.conversation_id;

const { data: msgs } = await sb
  .from("conversation_messages")
  .select("id, message_type, content, created_at, metadata")
  .eq("conversation_id", convId)
  .order("created_at", { ascending: true });

const incoming = (msgs ?? []).filter((m) => m.message_type === "incoming");
const outgoing = (msgs ?? []).filter((m) => m.message_type === "outgoing");
const markerIncoming = incoming.filter((m) => m.content?.includes(MARKER));
const postFixOutgoing = outgoing.filter((m) => {
  const ts = new Date(m.created_at).getTime();
  return ts >= Date.now() - 120_000;
});

console.log("\n=== conversation_messages ===");
console.log("total incoming:", incoming.length, "total outgoing:", outgoing.length);
console.log("marker incoming:", markerIncoming.length);
console.log("outgoing last 2m:", postFixOutgoing.length);
for (const m of postFixOutgoing) {
  console.log(JSON.stringify({
    id: m.id,
    content: m.content?.slice(0, 100),
    created_at: m.created_at,
    automationRunId: m.metadata?.automationRunId,
    correlationId: m.metadata?.correlationId,
  }));
}

const { data: deliveries } = await sb
  .from("channel_delivery_events")
  .select("id, delivery_status, outbound_message_id, created_at, payload")
  .eq("conversation_id", convId)
  .order("created_at", { ascending: true });

const postFixDeliveries = (deliveries ?? []).filter((d) => {
  const ts = new Date(d.created_at).getTime();
  return ts >= Date.now() - 120_000;
});

console.log("\n=== channel_delivery_events (last 2m) ===");
console.log("count:", postFixDeliveries.length);
for (const d of postFixDeliveries) {
  console.log(JSON.stringify({
    id: d.id,
    delivery_status: d.delivery_status,
    outbound_message_id: d.outbound_message_id,
    created_at: d.created_at,
    text: d.payload?.text?.slice?.(0, 80) ?? null,
  }));
}

const outgoingIds = new Set(postFixOutgoing.map((m) => m.id));
const linked = postFixDeliveries.filter((d) => d.outbound_message_id && outgoingIds.has(d.outbound_message_id));
const unlinked = postFixDeliveries.filter((d) => !d.outbound_message_id);

console.log("\n=== VERIFICATION ===");
const checks = [
  ["marker inbound persisted", markerIncoming.length >= 1],
  ["outgoing rows created (last 2m)", postFixOutgoing.length >= 1],
  ["delivery events created (last 2m)", postFixDeliveries.length >= 1],
  ["outbound_message_id populated", postFixDeliveries.every((d) => Boolean(d.outbound_message_id))],
  ["delivery links to conversation_messages", linked.length >= 1 && linked.length === postFixDeliveries.length],
  ["no duplicate outgoing per delivery", postFixOutgoing.length === postFixDeliveries.length || postFixOutgoing.length >= postFixDeliveries.length],
];

let allPass = true;
for (const [label, pass] of checks) {
  console.log(`[${pass ? "PASS" : "FAIL"}] ${label}`);
  if (!pass) allPass = false;
}

if (unlinked.length) {
  console.log("unlinked deliveries:", unlinked.length);
}

process.exit(allPass ? 0 : 1);
