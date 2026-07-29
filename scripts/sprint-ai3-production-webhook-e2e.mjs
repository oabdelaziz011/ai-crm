/**
 * Sprint AI.3 — Production WhatsApp → Enterprise Runtime E2E via live webhook.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTION_CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const WA_USER = "201023169075";
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

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function waPayload(phoneNumberId, body) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: phoneNumberId },
              contacts: [{ profile: { name: "Sprint AI.3 Verify" }, wa_id: WA_USER }],
              messages: [
                {
                  from: WA_USER,
                  id: `wamid.${randomUUID()}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function postWebhook(payload, url = WEBHOOK_URL) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.text().catch(() => "") };
}

const stages = [];
function stage(name, pass, detail, evidence = {}) {
  stages.push({ stage: name, pass, detail, evidence });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name}: ${detail}`);
}

const { data: channel } = await sb
  .from("company_channels")
  .select("id, company_id, status, configuration")
  .eq("id", PRODUCTION_CHANNEL_ID)
  .maybeSingle();

const phoneNumberId = String(channel?.configuration?.phoneNumberId ?? "");
const companyId = channel?.company_id;

stage(
  "1. Inbound WhatsApp channel configured",
  Boolean(channel?.status === "active" && phoneNumberId),
  channel ? `channel=${channel.id} phoneNumberId=${phoneNumberId}` : "channel missing",
);

const { data: binding } = await sb
  .from("company_channel_automation_bindings")
  .select("id, is_enabled, automation_flow_id")
  .eq("company_channel_id", PRODUCTION_CHANNEL_ID)
  .eq("is_enabled", true)
  .is("deleted_at", null)
  .maybeSingle();

stage(
  "2. Enterprise Runtime path (no active workflow binding)",
  !binding,
  binding ? `Workflow binding still enabled: ${binding.automation_flow_id}` : "Workflow binding disabled — AI runtime eligible",
);

const beforeExecCount = (
  await sb
    .from("tool_executions")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .in("tool_key", ["search_availability", "create_booking"])
).count;

const beforeRuntimeCount = (
  await sb
    .from("runtime_executions")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
).count;

const message = "I want to book an appointment. Please check availability.";

const urls = [
  WEBHOOK_URL,
  `${WEBHOOK_BASE.replace(/\/$/, "")}/api/webhooks/whatsapp/${PRODUCTION_CHANNEL_ID}`,
];

let webhookResult = { status: 0, body: "" };
for (const url of urls) {
  const result = await postWebhook(waPayload(phoneNumberId, message), url);
  webhookResult = result;
  if (result.status >= 200 && result.status < 300) break;
}

stage(
  "3. Webhook accepted inbound",
  webhookResult.status >= 200 && webhookResult.status < 300,
  `HTTP ${webhookResult.status}`,
  { body: webhookResult.body.slice(0, 500) },
);

await new Promise((r) => setTimeout(r, 15000));

const { data: recentRuntime } = await sb
  .from("runtime_executions")
  .select("id, status, model, started_at, finished_at, error_message")
  .eq("company_id", companyId)
  .order("started_at", { ascending: false })
  .limit(3);

const runtimeStarted = (recentRuntime ?? []).some(
  (r) => r.started_at && new Date(r.started_at).getTime() > Date.now() - 60_000,
);

stage(
  "4. Enterprise Runtime execution started",
  runtimeStarted,
  runtimeStarted
    ? `runtime_execution ${recentRuntime?.[0]?.id} status=${recentRuntime?.[0]?.status}`
    : "No runtime_execution in last 60s — production server may still route to automation or WEBHOOK_EXECUTE_AI=false",
  { recentRuntime },
);

const afterExecCount = (
  await sb
    .from("tool_executions")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .in("tool_key", ["search_availability", "create_booking"])
).count;

const { data: recentToolExecs } = await sb
  .from("tool_executions")
  .select("id, tool_key, status, triggered_by, started_at")
  .eq("company_id", companyId)
  .in("tool_key", ["search_availability", "create_booking"])
  .order("started_at", { ascending: false })
  .limit(5);

const toolExecCreated = (afterExecCount ?? 0) > (beforeExecCount ?? 0);

stage(
  "5. search_availability tool execution (LLM path)",
  toolExecCreated && (recentToolExecs ?? []).some((e) => e.tool_key === "search_availability"),
  toolExecCreated
    ? `tool_executions ${beforeExecCount}→${afterExecCount}`
    : "No new scheduling tool execution after webhook — check production deploy + AI config",
  { recentToolExecs },
);

const { data: outbound } = await sb
  .from("channel_delivery_events")
  .select("id, status, channel, created_at, payload")
  .eq("company_channel_id", PRODUCTION_CHANNEL_ID)
  .order("created_at", { ascending: false })
  .limit(5);

const recentOutbound = (outbound ?? []).filter(
  (d) => d.created_at && new Date(d.created_at).getTime() > Date.now() - 120_000,
);

stage(
  "6. Outbound WhatsApp response",
  recentOutbound.length > 0,
  recentOutbound.length > 0
    ? `${recentOutbound.length} delivery event(s) in last 2 min`
    : "No outbound delivery in last 2 min",
  { recentOutbound: recentOutbound.slice(0, 2) },
);

console.log("\n=== SUMMARY ===");
console.log(`${stages.filter((s) => s.pass).length}/${stages.length} stages PASS`);

writeFileSync(
  resolve(root, "docs/architecture/sprint-ai3-production-webhook-e2e-report.json"),
  JSON.stringify({ verifiedAt: new Date().toISOString(), stages, webhookUrl: WEBHOOK_URL }, null, 2),
);
