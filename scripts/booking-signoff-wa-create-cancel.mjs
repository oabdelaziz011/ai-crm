/**
 * Full booking sign-off: create + verify DB + cancel via URL-fallback webhook.
 * Uses service "عيادة" (linked to ADAM) since "اسنان" lacks resource_services link.
 */
import { randomUUID } from "node:crypto";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url));
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const SERVICE_ID = "a8a6403e-4c88-48ae-aa46-d204ea8ef49d";
const FROM = process.env.WA_SIGNOFF_FROM ?? "201011404109";
const API_BASE = (env.VITE_API_SERVER_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const WEBHOOK_URL = `${API_BASE}/api/webhooks/whatsapp/${CHANNEL_ID}`;
const TURN_WAIT_MS = Number(process.env.WA_SIGNOFF_TURN_WAIT_MS ?? 90000);

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const startedAt = new Date().toISOString();
const report = { startedAt, mode: "create_cancel_eyada", turns: [] };

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
              metadata: { display_phone_number: "201012345989" },
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

// Step 1-2: booking intent + service
await sendWa("عايز احجز", "intent");
await sendWa("عيادة", "service_eyada");

// Read last outbound for slot options
const session = await c.query(
  `select conversation_id from public.channel_sessions where company_id=$1 and sender_external_id=$2 order by updated_at desc limit 1`,
  [COMPANY_ID, FROM],
);
const conversationId = session.rows[0]?.conversation_id;

const outBeforeSlot = conversationId
  ? (
      await c.query(
        `select left(content, 800) as content, created_at from public.conversation_messages
         where conversation_id=$1::uuid and message_type='outgoing' and created_at >= $2::timestamptz
         order by created_at desc limit 1`,
        [conversationId, startedAt],
      )
    ).rows[0]
  : null;

report.slotPrompt = outBeforeSlot?.content ?? null;

// Pick a slot — try common Arabic weekday patterns from availability output
const slotText = process.env.WA_SIGNOFF_SLOT ?? "الأحد ٩ مساء";
await sendWa(slotText, "slot_select");

// If AI asks for info, provide name/age (customer likely exists via trustedCustomerId)
await sendWa("عمر 30", "customer_info_optional");

// Cancel
await sendWa("ألغي", "cancel");

const inbounds = (
  await c.query(
    `select id, external_message_id, incoming_message_id, runtime_execution_id, processing_status, created_at
     from public.channel_inbound_events where company_id=$1::uuid and created_at >= $2::timestamptz order by created_at`,
    [COMPANY_ID, startedAt],
  )
).rows;

const tools = conversationId
  ? (
      await c.query(
        `select id, tool_key, status, left(input::text, 400) as input, left(output::text, 600) as output, started_at
         from public.tool_executions where conversation_id=$1::uuid and started_at >= $2::timestamptz order by started_at`,
        [conversationId, startedAt],
      )
    ).rows
  : [];

const messages = conversationId
  ? (
      await c.query(
        `select id, message_type, left(content, 500) as content, created_at
         from public.conversation_messages where conversation_id=$1::uuid and created_at >= $2::timestamptz order by created_at`,
        [conversationId, startedAt],
      )
    ).rows
  : [];

const deliveries = conversationId
  ? (
      await c.query(
        `select id, delivery_status, error_message, created_at, left((payload->>'text')::text, 300) as text_preview
         from public.channel_delivery_events
         where company_id=$1::uuid and conversation_id=$2::uuid and created_at >= $3::timestamptz order by created_at`,
        [COMPANY_ID, conversationId, startedAt],
      )
    ).rows
  : [];

const bookings = (
  await c.query(
    `select id, confirmation_number, status, service_id, resource_id, customer_id, start_at, end_at, created_at, updated_at
     from public.scheduling_bookings where company_id=$1::uuid and created_at >= $2::timestamptz order by created_at`,
    [COMPANY_ID, startedAt],
  )
).rows;

report.summary = {
  conversationId,
  inboundCount: inbounds.length,
  createBookingTools: tools.filter((t) => t.tool_key === "create_booking"),
  cancelBookingTools: tools.filter((t) => t.tool_key === "cancel_booking"),
  searchAvailabilityTools: tools.filter((t) => t.tool_key === "search_availability"),
  outboundMessages: messages.filter((m) => m.message_type === "outgoing").slice(-5),
  deliveriesOk: deliveries.every((d) => d.delivery_status === "sent"),
  bookings,
  idempotency: {
    allHaveIncomingMessageId: inbounds.every((i) => i.incoming_message_id),
    oneRuntimePerInbound:
      inbounds.length > 0 &&
      inbounds.every((i) => i.runtime_execution_id && i.processing_status === "processed"),
  },
};

console.log(JSON.stringify(report, null, 2));
await c.end();
