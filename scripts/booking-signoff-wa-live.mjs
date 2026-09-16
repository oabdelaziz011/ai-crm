/**
 * Booking production sign-off — full WhatsApp multi-turn via enabled company channel.
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
const TURN_WAIT_MS = Number(process.env.WA_SIGNOFF_TURN_WAIT_MS ?? 60000);

const TURNS = [
  { label: "booking_intent", text: "عايز احجز" },
  { label: "service_asnan", text: "اسنان" },
];

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const ch = await c.query(`select configuration, is_enabled from public.company_channels where id=$1`, [
  CHANNEL_ID,
]);
const phoneNumberId = ch.rows[0]?.configuration?.phoneNumberId;
if (!phoneNumberId) throw new Error("missing phoneNumberId");
if (!ch.rows[0]?.is_enabled) throw new Error("company channel disabled");

const startedAt = new Date().toISOString();
const report = { startedAt, webhookUrl: WEBHOOK_URL, from: FROM, phoneNumberId, turns: [] };

async function sendWa(text, label) {
  const wamid = `wamid.signoff.${randomUUID()}`;
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: phoneNumberId, display_phone_number: "201012345989" },
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
  const body = (await res.text()).slice(0, 800);
  report.turns.push({ label, text, wamid, httpStatus: res.status, httpBody: body });
  await new Promise((r) => setTimeout(r, TURN_WAIT_MS));
  return { wamid, httpStatus: res.status };
}

for (const turn of TURNS) {
  await sendWa(turn.text, turn.label);
}

const session = await c.query(
  `select conversation_id from public.channel_sessions where company_id=$1 and sender_external_id=$2 order by updated_at desc limit 1`,
  [COMPANY_ID, FROM],
);
const conversationId = session.rows[0]?.conversation_id ?? null;
report.conversationId = conversationId;

const inbounds = await c.query(
  `select id, external_message_id, incoming_message_id, runtime_execution_id, processing_status, error_message, created_at
   from public.channel_inbound_events
   where company_id=$1::uuid and company_channel_id=$2::uuid and created_at >= $3::timestamptz
   order by created_at`,
  [COMPANY_ID, CHANNEL_ID, startedAt],
);

let messages = [];
let runtimes = [];
let tools = [];
let deliveries = [];

if (conversationId) {
  messages = (
    await c.query(
      `select id, message_type, left(content, 500) as content, external_message_id, created_at
       from public.conversation_messages where conversation_id=$1::uuid and created_at >= $2::timestamptz order by created_at`,
      [conversationId, startedAt],
    )
  ).rows;
  runtimes = (
    await c.query(
      `select id, execution_status, created_at, updated_at, conversation_id, error_message
       from public.runtime_executions where conversation_id=$1::uuid and created_at >= $2::timestamptz order by created_at`,
      [conversationId, startedAt],
    )
  ).rows;
  tools = (
    await c.query(
      `select id, tool_key, status, input, output, started_at, completed_at
       from public.tool_executions where conversation_id=$1::uuid and started_at >= $2::timestamptz order by started_at`,
      [conversationId, startedAt],
    )
  ).rows;
  deliveries = (
    await c.query(
      `select id, delivery_status, error_message, created_at, left((payload->>'text')::text, 400) as text_preview
       from public.channel_delivery_events
       where company_id=$1::uuid and conversation_id=$2::uuid and created_at >= $3::timestamptz order by created_at`,
      [COMPANY_ID, conversationId, startedAt],
    )
  ).rows;
}

const bookings = (
  await c.query(
    `select id, confirmation_number, status, service_id, resource_id, customer_id, scheduled_start_at, created_at
     from public.scheduling_bookings where company_id=$1::uuid and created_at >= $2::timestamptz order by created_at desc`,
    [COMPANY_ID, startedAt],
  )
).rows;

report.forensics = { inbounds: inbounds.rows, messages, runtimes, tools, deliveries, bookings };
report.idempotency = {
  inboundCount: inbounds.rows.length,
  allHaveIncomingMessageId: inbounds.rows.every((r) => r.incoming_message_id),
  perWamid: report.turns.map((t) => ({
    wamid: t.wamid,
    httpStatus: t.httpStatus,
    inbound: inbounds.rows.find((i) => i.external_message_id === t.wamid) ?? null,
  })),
  runtimeCount: runtimes.length,
  outboundCount: messages.filter((m) => m.message_type === "outgoing").length,
};

console.log(JSON.stringify(report, null, 2));
await c.end();
