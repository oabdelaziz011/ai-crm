/**
 * RC-3: Full WhatsApp certification probe (webhook response + DB evidence).
 *
 * Required env:
 *   CHANNEL_ID or COMPANY_CHANNEL_ID
 *   WHATSAPP_WEBHOOK_URL
 *   WHATSAPP_TEST_USER_ID or WHATSAPP_TEST_TO
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import {
  createServiceRoleSupabaseClient,
  loadDevScriptEnv,
  requireEnvValue,
  resolveChannelId,
  resolveWhatsAppTestRecipient,
} from "./lib/dev-script-env.mjs";

const { root, env } = loadDevScriptEnv(import.meta.url);
const argv = process.argv.slice(2);
const CHANNEL_ID = resolveChannelId(argv, env);
const WA_USER = resolveWhatsAppTestRecipient(argv, env);
const WEBHOOK_URL = requireEnvValue(env, ["WHATSAPP_WEBHOOK_URL"], "WhatsApp webhook URL");

const sb = createServiceRoleSupabaseClient(env, createClient);
const { data: channel } = await sb.from("company_channels").select("configuration, company_id").eq("id", CHANNEL_ID).single();
const phoneNumberId = String(channel?.configuration?.phoneNumberId ?? "");

const payload = {
  object: "whatsapp_business_account",
  entry: [{
    changes: [{
      field: "messages",
      value: {
        messaging_product: "whatsapp",
        metadata: { phone_number_id: phoneNumberId },
        contacts: [{ profile: { name: "RC3 Cert" }, wa_id: WA_USER }],
        messages: [{
          from: WA_USER,
          id: `wamid.${randomUUID()}`,
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: "text",
          text: { body: "RC-3 certification: please confirm my appointment options." },
        }],
      },
    }],
  }],
};

const before = new Date().toISOString();
const res = await fetch(WEBHOOK_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
const bodyText = await res.text();
let body = null;
try { body = JSON.parse(bodyText); } catch { body = { raw: bodyText.slice(0, 500) }; }

await new Promise((r) => setTimeout(r, 8000));

const inboundId = body?.response?.result?.inboundEventId ?? null;
const runtimeExecutionId = body?.response?.result?.runtimeExecutionId ?? null;
const outboundDeliveryId = body?.response?.result?.outboundDeliveryId ?? null;
const outboundError = body?.response?.result?.outboundError ?? null;
const responseContent = body?.response?.result?.responseContent ?? null;

let inbound = null;
if (inboundId) {
  const { data } = await sb.from("channel_inbound_events").select("*").eq("id", inboundId).maybeSingle();
  inbound = data;
}

let delivery = null;
if (outboundDeliveryId) {
  const { data } = await sb.from("channel_delivery_events").select("*").eq("id", outboundDeliveryId).maybeSingle();
  delivery = data;
} else {
  const { data } = await sb
    .from("channel_delivery_events")
    .select("*")
    .eq("company_channel_id", CHANNEL_ID)
    .gte("created_at", before)
    .order("created_at", { ascending: false })
    .limit(1);
  delivery = data?.[0] ?? null;
}

let aiExecution = null;
if (runtimeExecutionId) {
  const { data } = await sb.from("ai_executions").select("*").eq("id", runtimeExecutionId).maybeSingle();
  aiExecution = data;
}

const report = {
  certifiedAt: new Date().toISOString(),
  phase1: {
    httpStatus: res.status,
    httpOk: res.status >= 200 && res.status < 300,
    runtimeExecutionId,
    outboundDeliveryId,
    outboundError,
    responseContentPreview: responseContent?.slice(0, 200) ?? null,
    inboundProcessingStatus: inbound?.processing_status ?? null,
    metaMessageId: delivery?.external_message_id ?? null,
    deliveryStatus: delivery?.delivery_status ?? null,
    deliveryError: delivery?.error_message ?? null,
    aiExecutionStatus: aiExecution?.status ?? null,
    pass: res.status >= 200 && res.status < 300 && Boolean(runtimeExecutionId) && Boolean(delivery?.external_message_id) && !outboundError,
  },
};

writeFileSync(resolve(root, "docs/architecture/rc3-phase1-whatsapp-cert.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
