/**
 * Live production verification via https://webhook.valueor.org
 * POSTs WhatsApp payloads to the public webhook (same path Meta uses).
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const WEBHOOK_BASE = process.env.WEBHOOK_BASE_URL ?? "https://webhook.valueor.org";
const WEBHOOK_URL = `${WEBHOOK_BASE.replace(/\/$/, "")}/api/webhooks/whatsapp`;

const env = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function waPayload(waUser, phoneNumberId, body, type = "text", interactive = null) {
  const msg = type === "interactive"
    ? { from: waUser, id: `wamid.${randomUUID()}`, timestamp: "1", type, interactive }
    : { from: waUser, id: `wamid.${randomUUID()}`, timestamp: "1", type, text: { body } };
  return {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: {
      messaging_product: "whatsapp",
      metadata: { phone_number_id: phoneNumberId },
      contacts: [{ profile: { name: "Live Verify" }, wa_id: waUser }],
      messages: [msg],
      },
    }],
  }],
  };
}

async function postWebhook(payload) {
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.text().catch(() => "") };
}

async function checkReadyz() {
  const res = await fetch(`${WEBHOOK_BASE.replace(/\/$/, "")}/api/readyz`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  const readyzBefore = await checkReadyz();

  const { data: flow } = await sb.from("automation_flows").select("*").eq("id", FLOW_ID).single();
  const { data: binding } = await sb
    .from("company_channel_automation_bindings")
    .select("company_channel_id")
    .eq("automation_flow_id", FLOW_ID)
    .eq("is_enabled", true)
    .limit(1)
    .maybeSingle();
  const { data: channel } = await sb.from("company_channels").select("*").eq("id", binding!.company_channel_id).single();
  const phoneNumberId = String(channel!.configuration?.phoneNumberId);
  const waUser = `2010${String(Date.now()).slice(-8)}`;

  const steps = [];
  steps.push({ step: "hi", result: await postWebhook(waPayload(waUser, phoneNumberId, "Hello")) });
  await new Promise((r) => setTimeout(r, 3000));
  steps.push({ step: "book", result: await postWebhook(waPayload(waUser, phoneNumberId, "Book Appointment", "interactive", { type: "button_reply", button_reply: { id: "book", title: "Book Appointment" } })) });
  await new Promise((r) => setTimeout(r, 3000));
  steps.push({ step: "phone", result: await postWebhook(waPayload(waUser, phoneNumberId, "01023169075")) });
  await new Promise((r) => setTimeout(r, 5000));

  const { data: runs } = await sb.from("automation_runs").select("*").eq("flow_id", FLOW_ID).order("started_at", { ascending: false }).limit(5);
  const targetRun = (runs ?? []).find((r) => r.variables?.customer_phone === "01023169075") ?? runs?.[0];

  const { data: inbound } = await sb.from("channel_inbound_events").select("*").order("received_at", { ascending: false }).limit(5);
  const phoneInbound = (inbound ?? []).find((e) => e.payload?.message?.text?.body === "01023169075" || JSON.stringify(e).includes("01023169075"));

  const { data: deliveries } = targetRun
    ? await sb.from("channel_delivery_events").select("*").contains("payload", { metadata: { automationRunId: targetRun.id } })
    : { data: [] };

  const versionId = flow?.active_version_id;
  const { data: findNode } = versionId
    ? await sb.from("automation_flow_version_nodes").select("config").eq("flow_version_id", versionId).filter("config->>action", "eq", "find_customer").limit(1).maybeSingle()
    : { data: null };

  const report = {
    testedAt: new Date().toISOString(),
    webhookUrl: WEBHOOK_URL,
    readyz: readyzBefore,
    activeVersionId: versionId,
    findCustomerBinding: findNode?.config?.value,
    waUser,
    steps,
    targetRun: targetRun ? {
      id: targetRun.id,
      status: targetRun.status,
      current_node_id: targetRun.current_node_id,
      error_message: targetRun.error_message,
      customer_phone: targetRun.variables?.customer_phone,
      lookup: targetRun.variables?.lookup,
      customer: targetRun.variables?.customer,
      booking_id: targetRun.variables?.booking_id,
      variables: targetRun.variables,
    } : null,
    phoneInboundError: phoneInbound?.error_message ?? null,
    outboundCount: deliveries?.length ?? 0,
    outboundAfterPhone: (deliveries ?? []).filter((d) => d.created_at >= (phoneInbound?.received_at ?? "")),
    pass: Boolean(
      readyzBefore.body?.webhookRuntime?.customerService === true &&
      findNode?.config?.value?.variable === "{{customer_phone}}" &&
      targetRun?.variables?.lookup &&
      !phoneInbound?.error_message?.includes("customer service"),
    ),
  };

  const out = resolve(root, "docs/architecture/live-production-verification.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
