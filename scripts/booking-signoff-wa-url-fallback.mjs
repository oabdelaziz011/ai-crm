/**
 * Booking sign-off — webhook via URL fallback (no phone_number_id) to bypass duplicate-phone routing.
 * Uses enabled channel e126113b. Documents routing workaround only; real Meta webhooks include phone_number_id.
 */
import { randomUUID } from "node:crypto";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url));
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const FROM = process.env.WA_SIGNOFF_FROM ?? "201011404109";
const API_BASE = (env.VITE_API_SERVER_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const WEBHOOK_URL = `${API_BASE}/api/webhooks/whatsapp/${CHANNEL_ID}`;
const TURN_WAIT_MS = Number(process.env.WA_SIGNOFF_TURN_WAIT_MS ?? 75000);

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const startedAt = new Date().toISOString();
const report = { startedAt, webhookUrl: WEBHOOK_URL, routingMode: "url_fallback_no_phone_number_id", turns: [] };

async function sendWa(text, label, opts = {}) {
  const wamid = `wamid.signoff.${randomUUID()}`;
  const metadata = opts.includePhoneNumberId
    ? { phone_number_id: "1214681355059951", display_phone_number: "201012345989" }
    : { display_phone_number: "201012345989" };

  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata,
              contacts: [{ profile: { name: "Booking Signoff" }, wa_id: FROM }],
              messages: [
                {
                  from: FROM,
                  id: wamid,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.text()).slice(0, 1200);
  report.turns.push({ label, text, wamid, httpStatus: res.status, httpBody: body });
  await new Promise((r) => setTimeout(r, TURN_WAIT_MS));
  return { wamid, httpStatus: res.status, body };
}

// Turn sequence: intent → service (اسنان per sign-off spec)
const turn1 = await sendWa("عايز احجز", "booking_intent");
if (turn1.httpStatus !== 200) {
  console.log(JSON.stringify({ ...report, aborted: "turn1_failed" }, null, 2));
  await c.end();
  process.exit(1);
}

const turn2 = await sendWa("اسنان", "service_asnan");
// Continue even if AI reports no availability — capture forensics

const session = await c.query(
  `select conversation_id from public.channel_sessions where company_id=$1 and sender_external_id=$2 order by updated_at desc limit 1`,
  [COMPANY_ID, FROM],
);
const conversationId = session.rows[0]?.conversation_id ?? null;

const inbounds = (
  await c.query(
    `select id, external_message_id, incoming_message_id, runtime_execution_id, processing_status, error_message, company_channel_id, created_at
     from public.channel_inbound_events
     where company_id=$1::uuid and created_at >= $2::timestamptz order by created_at`,
    [COMPANY_ID, startedAt],
  )
).rows;

let messages = [], runtimes = [], tools = [], deliveries = [];
if (conversationId) {
  messages = (
    await c.query(
      `select id, message_type, left(content, 600) as content, external_message_id, created_at
       from public.conversation_messages where conversation_id=$1::uuid and created_at >= $2::timestamptz order by created_at`,
      [conversationId, startedAt],
    )
  ).rows;
  runtimes = (
    await c.query(
      `select id, execution_status, created_at, conversation_id, error_message
       from public.runtime_executions where conversation_id=$1::uuid and created_at >= $2::timestamptz order by created_at`,
      [conversationId, startedAt],
    )
  ).rows;
  tools = (
    await c.query(
      `select id, tool_key, status, left(input::text, 300) as input, left(output::text, 500) as output, started_at
       from public.tool_executions where conversation_id=$1::uuid and started_at >= $2::timestamptz order by started_at`,
      [conversationId, startedAt],
    )
  ).rows;
  deliveries = (
    await c.query(
      `select id, delivery_status, error_message, created_at, left((payload->>'text')::text, 500) as text_preview
       from public.channel_delivery_events
       where company_id=$1::uuid and conversation_id=$2::uuid and created_at >= $3::timestamptz order by created_at`,
      [COMPANY_ID, conversationId, startedAt],
    )
  ).rows;
}

const lastOutbound = messages.filter((m) => m.message_type === "outgoing").pop();

console.log(
  JSON.stringify(
    {
      ...report,
      conversationId,
      lastOutbound,
      forensics: { inbounds, messages, runtimes, tools, deliveries },
      idempotency: {
        inboundOnEnabledChannel: inbounds.filter((i) => i.company_channel_id === CHANNEL_ID).length,
        allHaveIncomingMessageId: inbounds.every((i) => i.incoming_message_id),
        perWamid: report.turns.map((t) => ({
          wamid: t.wamid,
          httpStatus: t.httpStatus,
          inbound: inbounds.find((i) => i.external_message_id === t.wamid) ?? null,
        })),
      },
    },
    null,
    2,
  ),
);
await c.end();
