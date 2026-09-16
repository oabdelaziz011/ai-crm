/**
 * Final live booking E2E — real Meta payload (phone_number_id) + اسنان flow + cancel.
 */
import { randomUUID } from "node:crypto";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url));
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const PHONE_NUMBER_ID = "1214681355059951";
const FROM = "201011404109";
const API = (env.VITE_API_SERVER_URL ?? "https://webhook.valueor.org").replace(/\/$/, "");
const WEBHOOK = `${API}/api/webhooks/whatsapp/${CHANNEL_ID}`;
const WAIT = 95000;
const startedAt = new Date().toISOString();

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const report = { startedAt, webhook: WEBHOOK, turns: [] };

async function send(text, label) {
  const wamid = `wamid.live.${randomUUID()}`;
  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { phone_number_id: PHONE_NUMBER_ID, display_phone_number: "201012345989" },
          contacts: [{ profile: { name: "Live Test" }, wa_id: FROM }],
          messages: [{
            from: FROM, id: wamid,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: "text", text: { body: text },
          }],
        },
      }],
    }],
  };
  const res = await fetch(WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const body = await res.text();
  report.turns.push({ label, text, wamid, httpStatus: res.status, preview: body.slice(0, 700) });
  await new Promise((r) => setTimeout(r, WAIT));
  return res.status;
}

await send("عايز احجز", "intent");
await send("اسنان", "service");
await send("الثلاثاء 25 أغسطس 7:30 مساء", "slot");
await send("201011404109", "phone_if_needed");
await send("ألغي", "cancel");

const session = await c.query(
  `select conversation_id from public.channel_sessions where company_id=$1 and sender_external_id=$2 order by updated_at desc limit 1`,
  [COMPANY_ID, FROM],
);
const convId = session.rows[0]?.conversation_id;

const inbounds = (await c.query(
  `select id, external_message_id, incoming_message_id, runtime_execution_id, processing_status, company_channel_id, created_at
   from public.channel_inbound_events where company_id=$1::uuid and created_at >= $2::timestamptz order by created_at`,
  [COMPANY_ID, startedAt],
)).rows;

const tools = convId ? (await c.query(
  `select tool_key, status, left(input::text,400) input, left(output::text,500) output, started_at
   from public.tool_executions where conversation_id=$1::uuid and started_at >= $2::timestamptz order by started_at`,
  [convId, startedAt],
)).rows : [];

const bookings = (await c.query(
  `select id, confirmation_number, status, service_id, customer_id, start_at, created_at, updated_at
   from public.scheduling_bookings where company_id=$1::uuid and (created_at >= $2::timestamptz or updated_at >= $2::timestamptz)
   order by created_at desc`,
  [COMPANY_ID, startedAt],
)).rows;

const deliveries = convId ? (await c.query(
  `select delivery_status, error_message, created_at, left((payload->>'text')::text,200) text
   from public.channel_delivery_events where conversation_id=$1::uuid and created_at >= $2::timestamptz order by created_at`,
  [convId, startedAt],
)).rows : [];

report.summary = {
  convId,
  allInbound200: report.turns.every((t) => t.httpStatus === 200),
  idempotency: {
    allHaveIncomingMessageId: inbounds.every((i) => i.incoming_message_id),
    inboundCount: inbounds.length,
    runtimeCount: inbounds.filter((i) => i.runtime_execution_id).length,
  },
  createBooking: tools.filter((t) => t.tool_key === "create_booking"),
  cancelBooking: tools.filter((t) => t.tool_key === "cancel_booking"),
  searchAvailability: tools.filter((t) => t.tool_key === "search_availability" && t.output?.includes("success\": true")),
  bookings,
  deliveriesOk: deliveries.every((d) => d.delivery_status === "sent"),
  routedToProdChannel: inbounds.every((i) => i.company_channel_id === CHANNEL_ID),
};

console.log(JSON.stringify(report, null, 2));
await c.end();
