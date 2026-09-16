/**
 * Continue disposable booking after welcome verify — pick exact offered slot 08:30.
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
const API = "http://127.0.0.1:3000";
const WEBHOOK = `${API}/api/webhooks/whatsapp/${CHANNEL_ID}`;
const WAIT_MS = 70000;
const startedAt = new Date().toISOString();

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

async function send(text, label) {
  const wamid = `wamid.verify2.${randomUUID()}`;
  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { phone_number_id: PHONE_NUMBER_ID, display_phone_number: "201012345989" },
          contacts: [{ profile: { name: "Verify" }, wa_id: FROM }],
          messages: [{
            from: FROM, id: wamid,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: "text", text: { body: text },
          }],
        },
      }],
    }],
  };
  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  console.error(JSON.stringify({ label, text, httpStatus: res.status, preview: body.slice(0, 700) }));
  await new Promise((r) => setTimeout(r, WAIT_MS));
}

await send("عايز أحجز عيادة الثلاثاء 08:30 مساء", "book_exact_slot");

const session = await c.query(
  `select conversation_id from public.channel_sessions
   where company_id=$1::uuid and sender_external_id=$2 order by updated_at desc limit 1`,
  [COMPANY_ID, FROM],
);
const convId = session.rows[0]?.conversation_id;

const tools = convId ? (await c.query(
  `select tool_key, status, left(input::text,500) input, left(output::text,900) output, started_at
   from public.tool_executions
   where conversation_id=$1::uuid and started_at >= $2::timestamptz
   order by started_at`,
  [convId, startedAt],
)).rows : [];

const bookings = (await c.query(
  `select id, confirmation_number, status, service_id, start_at, created_at
   from public.scheduling_bookings
   where company_id=$1::uuid and created_at >= $2::timestamptz
   order by created_at desc`,
  [COMPANY_ID, startedAt],
)).rows;

const msgs = convId ? (await c.query(
  `select message_type, left(content,600) content, metadata, created_at
   from public.conversation_messages
   where conversation_id=$1::uuid and created_at >= $2::timestamptz
   order by created_at`,
  [convId, startedAt],
)).rows : [];

const createTool = [...tools].reverse().find((t) => t.tool_key === "create_booking" && t.status === "succeeded");
let toolRef = null;
let toolOut = null;
if (createTool?.output) {
  try {
    toolOut = JSON.parse(createTool.output);
    toolRef = toolOut.bookingRef ?? toolOut.confirmationNumber ?? null;
  } catch {
    toolRef = String(createTool.output).match(/BK-\d+/i)?.[0] ?? null;
  }
}

const customerFacingRef = msgs
  .filter((m) => m.message_type === "outgoing")
  .map((m) => String(m.content ?? "").match(/رقم الحجز:\s*(BK-\d+)/i)?.[1])
  .filter(Boolean)
  .at(-1) ?? null;

const booking = bookings[0] ?? null;
const report = {
  startedAt,
  convId,
  tools,
  bookings,
  msgs,
  checks: {
    createOk: Boolean(createTool),
    dbRef: booking?.confirmation_number ?? null,
    toolRef,
    customerFacingRef,
    refsMatch:
      Boolean(booking?.confirmation_number) &&
      booking.confirmation_number === toolRef &&
      booking.confirmation_number === customerFacingRef,
    notUuidSlice: customerFacingRef ? !/^[0-9A-F]{8}$/i.test(customerFacingRef) : false,
  },
};

console.log(JSON.stringify(report, null, 2));
await c.end();
if (!report.checks.refsMatch) process.exitCode = 1;
