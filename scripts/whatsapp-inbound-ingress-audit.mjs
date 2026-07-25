/**
 * Read-only audit: why inbound messages[] webhooks may be missing.
 * Prints investigation results only (no secrets).
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const env = {};
  for (const filePath of [
    resolve(projectRoot, ".env"),
    resolve(projectRoot, "artifacts/login-app/.env.local"),
  ]) {
    try {
      for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!match) continue;
        env[match[1]] ??= match[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* optional */
    }
  }
  return env;
}

function summarizePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { kind: "unknown", messageCount: 0, statusCount: 0 };
  }

  let messageCount = 0;
  let statusCount = 0;
  let messageType = null;
  let statusType = null;

  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = entry?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = change?.value;
      if (!value || typeof value !== "object") continue;
      const messages = value.messages;
      const statuses = value.statuses;
      if (Array.isArray(messages)) {
        messageCount += messages.length;
        messageType = messages[0]?.type ?? messageType;
      }
      if (Array.isArray(statuses)) {
        statusCount += statuses.length;
        statusType = statuses[0]?.status ?? statusType;
      }
    }
  }

  if (messageCount > 0) return { kind: "inbound_message", messageCount, statusCount, messageType };
  if (statusCount > 0) return { kind: "delivery_status", messageCount, statusCount, statusType };
  return { kind: "empty", messageCount, statusCount };
}

function summarizeStoredPayload(payload) {
  const message = payload?.message;
  if (message && typeof message === "object") {
    return {
      kind: "inbound_message",
      messageType: message.type ?? null,
      replyId: message.interactive?.list_reply?.id ?? message.interactive?.button_reply?.id ?? null,
    };
  }
  const deliveryStatus = payload?.deliveryStatus;
  if (deliveryStatus) {
    return { kind: "delivery_status", status: deliveryStatus };
  }
  return { kind: "unknown" };
}

const env = loadEnv();
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const productionChannelId = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const expectedWebhookUrl = `${(env.VITE_API_SERVER_URL || "https://webhook.valueor.org").replace(/\/$/, "")}/api/webhooks/whatsapp`;

console.log("=== CONFIGURED WEBHOOK URL (portal) ===");
console.log(expectedWebhookUrl);

const { data: channels, error: channelError } = await sb
  .from("company_channels")
  .select("id, display_name, webhook_url, configuration, is_enabled, status, health_status, updated_at")
  .eq("id", productionChannelId)
  .maybeSingle();

if (channelError) {
  console.error("Channel query failed:", channelError.message);
  process.exit(1);
}

const phoneNumberId =
  typeof channels?.configuration?.phoneNumberId === "string"
    ? channels.configuration.phoneNumberId
    : null;
const accessToken =
  typeof channels?.configuration?.accessToken === "string"
    ? channels.configuration.accessToken
    : null;

console.log("\n=== PRODUCTION CHANNEL ===");
console.log(
  JSON.stringify(
    {
      id: channels?.id ?? null,
      display_name: channels?.display_name ?? null,
      webhook_url: channels?.webhook_url ?? null,
      phoneNumberId,
      is_enabled: channels?.is_enabled ?? null,
      status: channels?.status ?? null,
      health_status: channels?.health_status ?? null,
      hasAccessToken: Boolean(accessToken),
      hasAppSecret: Boolean(channels?.configuration?.appSecret || channels?.configuration?.app_secret),
    },
    null,
    2,
  ),
);

console.log("\n=== RECENT channel_inbound_events (production channel, last 30) ===");
const { data: inboundEvents, error: inboundError } = await sb
  .from("channel_inbound_events")
  .select("id, created_at, external_message_id, sender_external_id, processing_status, error_message, payload")
  .eq("company_channel_id", productionChannelId)
  .order("created_at", { ascending: false })
  .limit(30);

if (inboundError) {
  console.error("Inbound events query failed:", inboundError.message);
} else {
  const counts = { inbound_message: 0, delivery_status: 0, unknown: 0 };
  for (const row of inboundEvents ?? []) {
    const summary = summarizeStoredPayload(row.payload ?? {});
    counts[summary.kind] = (counts[summary.kind] ?? 0) + 1;
  }
  console.log("Counts by stored payload kind:", counts);
  console.log("Latest 10:");
  for (const row of (inboundEvents ?? []).slice(0, 10)) {
    const summary = summarizeStoredPayload(row.payload ?? {});
    console.log(
      JSON.stringify({
        created_at: row.created_at,
        external_message_id: row.external_message_id,
        sender: row.sender_external_id,
        processing_status: row.processing_status,
        error: row.error_message?.slice(0, 80) ?? null,
        ...summary,
      }),
    );
  }
}

console.log("\n=== ALL WhatsApp channels (phoneNumberId + webhook_url) ===");
const { data: waType } = await sb.from("communication_channels").select("id").eq("key", "whatsapp").maybeSingle();
const { data: allWa } = await sb
  .from("company_channels")
  .select("id, display_name, webhook_url, configuration, is_enabled")
  .eq("channel_id", waType?.id ?? "")
  .is("deleted_at", null);

for (const ch of allWa ?? []) {
  console.log(
    JSON.stringify({
      id: ch.id,
      display_name: ch.display_name,
      webhook_url: ch.webhook_url,
      phoneNumberId: ch.configuration?.phoneNumberId ?? null,
      is_enabled: ch.is_enabled,
    }),
  );
}

if (phoneNumberId && accessToken) {
  const apiVersion =
    typeof channels?.configuration?.apiVersion === "string"
      ? channels.configuration.apiVersion
      : "v21.0";

  console.log("\n=== META GRAPH API: phone number status ===");
  try {
    const phoneRes = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,platform_type,code_verification_status,status`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const phoneBody = await phoneRes.json();
    if (!phoneRes.ok) {
      console.log(JSON.stringify({ httpStatus: phoneRes.status, error: phoneBody.error ?? phoneBody }));
    } else {
      console.log(JSON.stringify(phoneBody, null, 2));
    }
  } catch (error) {
    console.log("Graph API phone lookup failed:", error instanceof Error ? error.message : String(error));
  }

  console.log("\n=== META GRAPH API: WABA subscribed apps (if token permits) ===");
  try {
    const wabaRes = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=whatsapp_business_account`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const wabaBody = await wabaRes.json();
    const wabaId = wabaBody?.whatsapp_business_account?.id ?? wabaBody?.id;
    if (wabaId) {
      const subRes = await fetch(`https://graph.facebook.com/${apiVersion}/${wabaId}/subscribed_apps`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const subBody = await subRes.json();
      console.log(JSON.stringify({ wabaId, httpStatus: subRes.status, subscribed_apps: subBody }, null, 2));
    } else {
      console.log(JSON.stringify({ phoneLookup: wabaBody }));
    }
  } catch (error) {
    console.log("Graph API subscription lookup failed:", error instanceof Error ? error.message : String(error));
  }
}

console.log("\n=== EXPRESS INGRESS NOTE ===");
console.log(
  "If status/read webhooks reach whatsapp.adapter.classified, the callback URL and tunnel are working for the messages field.",
);
console.log(
  "Search runtime logs for webhook.payload_parsed with messageCount > 0 — logged BEFORE routing/signature/handler.",
);
