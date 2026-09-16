/**
 * Disposable local WhatsApp verify: greeting-only welcome once + create_booking BK ref.
 * Hits local api-server webhook with Meta-shaped payloads (no production deploy required).
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
const API = (env.VITE_API_SERVER_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const WEBHOOK = `${API}/api/webhooks/whatsapp/${CHANNEL_ID}`;
const WAIT_MS = Number(process.env.VERIFY_WAIT_MS ?? 70000);
const startedAt = new Date().toISOString();

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const report = { startedAt, webhook: WEBHOOK, waitMs: WAIT_MS, turns: [], checks: {} };

async function send(text, label) {
  const wamid = `wamid.verify.${randomUUID()}`;
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
            from: FROM,
            id: wamid,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: "text",
            text: { body: text },
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
  report.turns.push({ label, text, wamid, httpStatus: res.status, preview: body.slice(0, 500) });
  await new Promise((r) => setTimeout(r, WAIT_MS));
}

// Force a new AI-employee engagement so deterministic welcome can fire again.
const sessionRow = await c.query(
  `select id, conversation_id, metadata, last_inbound_at
   from public.channel_sessions
   where company_id=$1::uuid and company_channel_id=$2::uuid and sender_external_id=$3
   order by updated_at desc limit 1`,
  [COMPANY_ID, CHANNEL_ID, FROM],
);
const session = sessionRow.rows[0];
if (session) {
  const metadata = typeof session.metadata === "object" && session.metadata ? { ...session.metadata } : {};
  const engagement = metadata.aiEmployeeEngagement && typeof metadata.aiEmployeeEngagement === "object"
    ? { ...metadata.aiEmployeeEngagement }
    : {};
  engagement.welcomeDeliveredAt = null;
  engagement.startedAt = new Date().toISOString();
  metadata.aiEmployeeEngagement = engagement;
  await c.query(
    `update public.channel_sessions
     set metadata=$2::jsonb,
         last_inbound_at=$3::timestamptz,
         updated_at=now()
     where id=$1::uuid`,
    [session.id, JSON.stringify(metadata), new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()],
  );
  report.sessionReset = { sessionId: session.id, conversationId: session.conversation_id };
}

await send("مساء الخير", "greeting_only");
await send("عايز أحجز عيادة", "intent");
await send("الثلاثاء 25 أغسطس 8:00 مساء", "slot");
await send("201011404109", "phone_if_needed");

const sessionAfter = await c.query(
  `select conversation_id from public.channel_sessions
   where company_id=$1::uuid and sender_external_id=$2
   order by updated_at desc limit 1`,
  [COMPANY_ID, FROM],
);
const convId = sessionAfter.rows[0]?.conversation_id ?? null;
report.conversationId = convId;

const msgs = convId
  ? (await c.query(
      `select id, message_type, left(content, 500) content, metadata, created_at
       from public.conversation_messages
       where conversation_id=$1::uuid and created_at >= $2::timestamptz
       order by created_at`,
      [convId, startedAt],
    )).rows
  : [];

const tools = convId
  ? (await c.query(
      `select id, tool_key, status, left(input::text, 400) input, left(output::text, 800) output, started_at
       from public.tool_executions
       where conversation_id=$1::uuid and started_at >= $2::timestamptz
       order by started_at`,
      [convId, startedAt],
    )).rows
  : [];

const bookings = (await c.query(
  `select id, confirmation_number, status, service_id, customer_id, start_at, created_at
   from public.scheduling_bookings
   where company_id=$1::uuid and created_at >= $2::timestamptz
   order by created_at desc`,
  [COMPANY_ID, startedAt],
)).rows;

const outbound = msgs.filter((m) => m.message_type === "assistant" || m.message_type === "ai" || m.message_type === "outbound");
const welcomeMsgs = outbound.filter((m) =>
  /أهلاً|مرحب|كيف يمكنني مساعدتك اليوم/i.test(String(m.content ?? "")) ||
  (m.metadata && (m.metadata.deterministicWelcome === true || m.metadata?.deterministicWelcome === "true")),
);
const masaNoor = outbound.filter((m) => /مساء النور/i.test(String(m.content ?? "")));

const createTool = tools.find((t) => t.tool_key === "create_booking" && t.status === "succeeded");
let toolBookingRef = null;
if (createTool?.output) {
  try {
    const parsed = typeof createTool.output === "string" ? JSON.parse(createTool.output) : createTool.output;
    toolBookingRef = parsed.bookingRef ?? parsed.confirmationNumber ?? null;
    if (!toolBookingRef && typeof createTool.output === "string") {
      toolBookingRef = createTool.output.match(/BK-\d+/i)?.[0] ?? null;
    }
  } catch {
    toolBookingRef = String(createTool.output).match(/BK-\d+/i)?.[0] ?? null;
  }
}

const booking = bookings[0] ?? null;
const customerFacingRef = outbound
  .map((m) => String(m.content ?? "").match(/رقم الحجز:\s*(BK-\d+)/i)?.[1])
  .filter(Boolean)
  .at(-1) ?? null;

report.msgs = msgs;
report.tools = tools;
report.bookings = bookings;
report.checks = {
  welcomeOutboundCount: welcomeMsgs.length,
  masaNoorCount: masaNoor.length,
  greetingPass: welcomeMsgs.length === 1 && masaNoor.length === 0,
  createBookingSucceeded: Boolean(createTool),
  dbConfirmation: booking?.confirmation_number ?? null,
  toolBookingRef,
  customerFacingRef,
  refsMatch:
    Boolean(booking?.confirmation_number) &&
    booking.confirmation_number === toolBookingRef &&
    booking.confirmation_number === customerFacingRef &&
    !/^[0-9A-F]{8}$/i.test(String(customerFacingRef ?? "")) &&
    /^BK-\d+$/i.test(String(customerFacingRef ?? "")),
};

console.log(JSON.stringify(report, null, 2));
await c.end();

if (!report.checks.greetingPass || !report.checks.refsMatch) {
  process.exitCode = 1;
}
