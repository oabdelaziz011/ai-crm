/**
 * End-to-end via redeployed api-server webhook (POST /api/webhooks/whatsapp).
 * Full book flow → create customer → auto-link conversation.customer_id.
 */
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FLOW_ID = "aef7c4ab-513a-4b64-a700-2be6cf51dafc";
const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";

const env = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const API_BASE = (env.VITE_API_SERVER_URL || "http://localhost:3000").replace(/\/$/, "");
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const marker = Date.now();
const WA_USER = `2011${String(marker).slice(-8)}`;
const TEST_PHONE = `011${String(marker).slice(-8)}`;
const TEST_NAME = `Link Verify ${String(marker).slice(-6)}`;

const { data: channel } = await sb.from("company_channels").select("configuration, company_id").eq("id", CHANNEL_ID).single();
const phoneNumberId = channel?.configuration?.phoneNumberId;
if (!phoneNumberId) throw new Error("phoneNumberId missing");

function payload(message) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { phone_number_id: phoneNumberId },
          contacts: [{ profile: { name: "Link Verify Bot" }, wa_id: WA_USER }],
          messages: [{
            from: WA_USER,
            id: `wamid.${randomUUID()}`,
            timestamp: String(Math.floor(Date.now() / 1000)),
            ...message,
          }],
        },
      }],
    }],
  };
}

async function post(label, message) {
  const body = payload(message);
  const res = await fetch(`${API_BASE}/api/webhooks/whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  if (!res.ok) throw new Error(`${label} failed ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

console.log("=== PRE-FLIGHT ===");
const readyz = await fetch(`${API_BASE}/api/readyz`).then((r) => r.json());
console.log("readyz.webhookRuntime:", readyz.webhookRuntime);
if (!readyz.webhookRuntime?.conversationCustomerLink) {
  throw new Error("conversationCustomerLink not enabled on api-server");
}

console.log("API:", `${API_BASE}/api/webhooks/whatsapp`);
console.log("WA_USER:", WA_USER, "PHONE:", TEST_PHONE, "NAME:", TEST_NAME);

const steps = [];
let conversationId;

const r1 = await post("hello", { type: "text", text: { body: "Hello" } });
conversationId = r1.conversationId;
steps.push({ step: "hello", conversationId, automationRunId: r1.automationRunId });

await new Promise((r) => setTimeout(r, 1500));
const r2 = await post("book", {
  type: "interactive",
  interactive: { type: "button_reply", button_reply: { id: "book", title: "Book Appointment" } },
});
conversationId = r2.conversationId ?? conversationId;
steps.push({ step: "book", conversationId, automationRunId: r2.automationRunId });

await new Promise((r) => setTimeout(r, 1500));
const r3 = await post("phone", { type: "text", text: { body: TEST_PHONE } });
steps.push({ step: "phone", conversationId: r3.conversationId ?? conversationId, automationRunId: r3.automationRunId });

await new Promise((r) => setTimeout(r, 2000));
const r4 = await post("name", { type: "text", text: { body: TEST_NAME } });
steps.push({ step: "name", conversationId: r4.conversationId ?? conversationId, automationRunId: r4.automationRunId });

await new Promise((r) => setTimeout(r, 1500));
const r5 = await post("gender", {
  type: "interactive",
  interactive: { type: "list_reply", list_reply: { id: "female", title: "Female" } },
});
steps.push({ step: "gender", conversationId: r5.conversationId ?? conversationId, automationRunId: r5.automationRunId });

await new Promise((r) => setTimeout(r, 1500));
const r6 = await post("age", { type: "text", text: { body: "55" } });
conversationId = r6.conversationId ?? conversationId;
steps.push({ step: "age", conversationId, automationRunId: r6.automationRunId });

await new Promise((r) => setTimeout(r, 3000));

const runId = r6.automationRunId ?? steps.map((s) => s.automationRunId).filter(Boolean).pop();
const { data: run } = runId ? await sb.from("automation_runs").select("*").eq("id", runId).single() : { data: null };

const vars = run?.variables ?? {};
const customerId = vars.customer?.id ?? null;

const { data: convBeforeLinkCheck } = conversationId
  ? await sb.from("conversations").select("id, customer_id, conversation_number, company_id").eq("id", conversationId).single()
  : { data: null };

const { data: customerRow } = customerId
  ? await sb.from("customers").select("id, name, phone, age, gender").eq("id", customerId).single()
  : { data: null };

const sqlEquivalent = conversationId
  ? `SELECT id, customer_id FROM conversations WHERE id = '${conversationId}';`
  : null;

const report = {
  generatedAt: new Date().toISOString(),
  apiBase: API_BASE,
  readyzWebhookRuntime: readyz.webhookRuntime,
  testIdentity: { waUser: WA_USER, phone: TEST_PHONE, name: TEST_NAME },
  steps,
  runId,
  conversation: convBeforeLinkCheck,
  sql: sqlEquivalent,
  sqlResult: convBeforeLinkCheck ? { id: convBeforeLinkCheck.id, customer_id: convBeforeLinkCheck.customer_id } : null,
  customerRow,
  runVariables: {
    customer_name: vars.customer_name,
    customer_phone: vars.customer_phone,
    customer_age: vars.customer_age,
    customer_gender: vars.customer_gender,
  },
  pass:
    Boolean(customerId) &&
    convBeforeLinkCheck?.customer_id === customerId &&
    customerRow?.name === TEST_NAME &&
    customerRow?.phone === TEST_PHONE &&
    customerRow?.age === 55 &&
    (customerRow?.gender === "female" || customerRow?.gender === "Female"),
  teamInboxUrl: "http://localhost:5173/dashboard/conversations",
  conversationNumber: convBeforeLinkCheck?.conversation_number,
};

mkdirSync(resolve(root, "docs/architecture"), { recursive: true });
writeFileSync(resolve(root, "docs/architecture/conversation-customer-link-e2e-report.json"), JSON.stringify(report, null, 2));

console.log("\n=== SQL ===");
console.log(sqlEquivalent);
console.log("Result:", JSON.stringify(report.sqlResult, null, 2));
console.log("\n=== CUSTOMER ROW ===");
console.log(JSON.stringify(customerRow, null, 2));
console.log("\n=== PASS ===", report.pass);
console.log("Conversation:", convBeforeLinkCheck?.conversation_number, convBeforeLinkCheck?.id);

process.exit(report.pass ? 0 : 1);
