import { randomUUID } from "node:crypto";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url));
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const FROM = "201011404109";
const WEBHOOK = `http://127.0.0.1:3000/api/webhooks/whatsapp/${CHANNEL_ID}`;
const startedAt = new Date().toISOString();

const wamid = `wamid.verify3.${randomUUID()}`;
const payload = {
  object: "whatsapp_business_account",
  entry: [{
    changes: [{
      field: "messages",
      value: {
        messaging_product: "whatsapp",
        metadata: { phone_number_id: "1214681355059951", display_phone_number: "201012345989" },
        contacts: [{ profile: { name: "Verify" }, wa_id: FROM }],
        messages: [{
          from: FROM,
          id: wamid,
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: "text",
          text: { body: "الثلاثاء 08:30 مساء" },
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
console.log("HTTP", res.status, body.slice(0, 1000));
await new Promise((r) => setTimeout(r, 75000));

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const conv = (await c.query(
  `select conversation_id from public.channel_sessions
   where company_id=$1::uuid and sender_external_id=$2
   order by updated_at desc limit 1`,
  [COMPANY_ID, FROM],
)).rows[0]?.conversation_id;

const tools = conv
  ? (await c.query(
      `select tool_key, status, left(output::text, 900) output, started_at
       from public.tool_executions
       where conversation_id=$1::uuid and started_at >= $2::timestamptz
       order by started_at`,
      [conv, startedAt],
    )).rows
  : [];

const bookings = (await c.query(
  `select id, confirmation_number, status, start_at, created_at
   from public.scheduling_bookings
   where company_id=$1::uuid and created_at >= $2::timestamptz
   order by created_at desc`,
  [COMPANY_ID, startedAt],
)).rows;

const msgs = conv
  ? (await c.query(
      `select message_type, left(content, 600) content, metadata, created_at
       from public.conversation_messages
       where conversation_id=$1::uuid and created_at >= $2::timestamptz
       order by created_at`,
      [conv, startedAt],
    )).rows
  : [];

const create = [...tools].reverse().find((t) => t.tool_key === "create_booking" && t.status === "succeeded");
let toolRef = null;
let parsed = null;
if (create?.output) {
  try {
    parsed = JSON.parse(create.output);
    toolRef = parsed.bookingRef ?? parsed.confirmationNumber ?? null;
  } catch {
    toolRef = String(create.output).match(/BK-\d+/i)?.[0] ?? null;
  }
}

const face =
  msgs
    .filter((m) => m.message_type === "outgoing")
    .map((m) => String(m.content ?? "").match(/رقم الحجز:\s*(BK-\d+)/i)?.[1])
    .filter(Boolean)
    .at(-1) ?? null;

const booking = bookings[0] ?? null;
const report = {
  conv,
  tools,
  bookings,
  msgs,
  checks: {
    createOk: Boolean(create),
    dbRef: booking?.confirmation_number ?? null,
    toolRef,
    face,
    match:
      Boolean(booking?.confirmation_number) &&
      booking.confirmation_number === toolRef &&
      booking.confirmation_number === face,
    uuidSlice: /^[0-9A-F]{8}$/i.test(String(face ?? "")),
  },
};

console.log(JSON.stringify(report, null, 2));
await c.end();
process.exit(report.checks.match ? 0 : 1);
