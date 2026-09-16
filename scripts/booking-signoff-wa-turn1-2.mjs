/**
 * Booking production sign-off — multi-turn WhatsApp webhook + DB forensics.
 * Read-only except inbound webhook posts (no DB mutations by script).
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
const TURN_WAIT_MS = Number(process.env.WA_SIGNOFF_TURN_WAIT_MS ?? 55000);

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const ch = await c.query(`select configuration from public.company_channels where id=$1`, [CHANNEL_ID]);
const phoneNumberId = ch.rows[0]?.configuration?.phoneNumberId;
if (!phoneNumberId) throw new Error("missing phoneNumberId");

const sessionBefore = await c.query(
  `select conversation_id from public.channel_sessions
   where company_id=$1 and sender_external_id=$2
   order by updated_at desc limit 1`,
  [COMPANY_ID, FROM],
);
const conversationIdBefore = sessionBefore.rows[0]?.conversation_id ?? null;

const startedAt = new Date().toISOString();
const report = {
  startedAt,
  from: FROM,
  phoneNumberId,
  conversationIdBefore,
  turns: [],
};

async function sendWa(text, label) {
  const wamid = `wamid.signoff.${randomUUID()}`;
  const sentAt = new Date().toISOString();
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

  const res = await fetch(`${API_BASE}/api/webhooks/whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.text()).slice(0, 500);
  report.turns.push({ label, text, wamid, sentAt, httpStatus: res.status, httpBody: body });
  await new Promise((r) => setTimeout(r, TURN_WAIT_MS));
  return wamid;
}

// Turn 1: booking intent
await sendWa("عايز احجز", "booking_intent");

// Turn 2: service selection — اسنان (configured but missing resource link)
await sendWa("اسنان", "service_asnan");

// If first flow stalls, we continue with follow-ups based on typical intake
// Turn 3+: will be filled after inspecting outbound from turn 2

const sessionAfter = await c.query(
  `select conversation_id from public.channel_sessions
   where company_id=$1 and sender_external_id=$2
   order by updated_at desc limit 1`,
  [COMPANY_ID, FROM],
);
const conversationId = sessionAfter.rows[0]?.conversation_id ?? conversationIdBefore;
report.conversationId = conversationId;

if (conversationId) {
  const inbounds = await c.query(
    `select id, external_message_id, incoming_message_id, processing_status, error_message, created_at
     from public.channel_inbound_events
     where company_id=$1::uuid and created_at >= $2::timestamptz
     order by created_at`,
    [COMPANY_ID, startedAt],
  );
  const messages = await c.query(
    `select id, direction, left(content, 200) as content, external_message_id, created_at
     from public.conversation_messages
     where conversation_id=$1::uuid and created_at >= $2::timestamptz
     order by created_at`,
    [conversationId, startedAt],
  );
  const runtimes = await c.query(
    `select id, status, created_at, completed_at
     from public.runtime_executions
     where conversation_id=$1::uuid and created_at >= $2::timestamptz
     order by created_at`,
    [conversationId, startedAt],
  );
  const tools = await c.query(
    `select id, tool_key, status, input, output, started_at, completed_at
     from public.tool_executions
     where conversation_id=$1::uuid and started_at >= $2::timestamptz
     order by started_at`,
    [conversationId, startedAt],
  );
  const deliveries = await c.query(
    `select id, delivery_status, error_message, created_at, payload
     from public.channel_delivery_events
     where company_id=$1::uuid and conversation_id=$2::uuid and created_at >= $3::timestamptz
     order by created_at`,
    [COMPANY_ID, conversationId, startedAt],
  );
  const latestBooking = await c.query(
    `select id, confirmation_number, status, service_id, resource_id, customer_id, scheduled_start_at, created_at
     from public.scheduling_bookings
     where company_id=$1::uuid and created_at >= $2::timestamptz
     order by created_at desc limit 3`,
    [COMPANY_ID, startedAt],
  );

  report.forensics = {
    inbounds: inbounds.rows,
    messages: messages.rows,
    runtimes: runtimes.rows,
    tools: tools.rows.map((row) => ({
      id: row.id,
      tool_key: row.tool_key,
      status: row.status,
      input: row.input,
      output: row.output,
      started_at: row.started_at,
      completed_at: row.completed_at,
    })),
    deliveries: deliveries.rows.map((row) => ({
      id: row.id,
      delivery_status: row.delivery_status,
      error_message: row.error_message,
      created_at: row.created_at,
      textPreview: row.payload?.text?.slice?.(0, 300) ?? null,
    })),
    bookings: latestBooking.rows,
  };

  report.idempotency = {
    inboundCount: inbounds.rows.length,
    allHaveIncomingMessageId: inbounds.rows.every((r) => r.incoming_message_id),
    uniqueWamids: [...new Set(report.turns.map((t) => t.wamid))].length,
    runtimeCount: runtimes.rows.length,
    outboundCount: messages.rows.filter((m) => m.direction === "outbound").length,
  };
}

console.log(JSON.stringify(report, null, 2));
await c.end();
