/**
 * Continue production verification from known offered slot (find_next_available).
 * Offered: 2026-08-25 19:15 ADAM / اسنان
 */
import { randomUUID } from "node:crypto";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url));
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const PHONE_NUMBER_ID = "1214681355059951";
const SERVICE_ID = "efbad361-d193-4ea7-a211-e23113b95f5a";
const TRUSTED_CUSTOMER_ID = "6c1f2063-d89d-45a1-b7ec-87cbd476816d";
const CONV_ID = "9de058d8-0a5e-4fbc-a8a7-bfa43ea3776b";
const FROM = "201011404109";
const API = "http://127.0.0.1:3000";
const WEBHOOK = `${API}/api/webhooks/whatsapp/${CHANNEL_ID}`;
const WAIT = 95000;

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const report = { startedAt: new Date().toISOString(), webhook: WEBHOOK, turns: [], stop: null, results: {} };

function fail(step, layer, evidence) {
  report.stop = { step, layer, evidence };
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

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
  let parsed = null;
  try { parsed = JSON.parse(body); } catch { /* ignore */ }
  const turn = {
    label, text, wamid, httpStatus: res.status,
    responseContent: parsed?.response?.result?.responseContent ?? null,
    inboundEventId: parsed?.response?.result?.inboundEventId ?? null,
    runtimeExecutionId: parsed?.response?.result?.runtimeExecutionId ?? null,
    outboundDeliveryId: parsed?.response?.result?.outboundDeliveryId ?? null,
    preview: body.slice(0, 900),
  };
  report.turns.push(turn);
  if (res.status !== 200) fail(label, "webhook.http", { httpStatus: res.status, body: body.slice(0, 400) });
  await new Promise((r) => setTimeout(r, WAIT));
  return turn;
}

async function toolsSince(sinceIso) {
  return (await c.query(
    `select id, tool_key, status, input, output, started_at
     from public.tool_executions
     where conversation_id = $1::uuid and started_at >= $2::timestamptz
     order by started_at`,
    [CONV_ID, sinceIso],
  )).rows;
}

// Ensure no leftover active future bookings for sole-cancel path
const active = (await c.query(
  `select confirmation_number, status from public.scheduling_bookings
   where company_id=$1::uuid and customer_id=$2::uuid and deleted_at is null
     and status in ('pending','confirmed') and start_at > now()`,
  [COMPANY_ID, TRUSTED_CUSTOMER_ID],
)).rows;
if (active.length > 0) {
  for (const row of active) {
    await send(`ألغي ${row.confirmation_number}`, `cleanup_${row.confirmation_number}`);
  }
}

const bookingStartedAt = new Date().toISOString();

// Slot offered by find_next_available in prior turn: 2026-08-25 19:15
await send("الثلاثاء 25 أغسطس 7:15 مساء", "slot_select");
await send("201011404109", "phone_confirm");

const createTools = (await toolsSince(bookingStartedAt)).filter((t) => t.tool_key === "create_booking");
const createOk = createTools.find((t) => t.output?.success === true);
const created = (await c.query(
  `select id, confirmation_number, status, service_id, resource_id, customer_id, start_at, end_at, created_at, updated_at
   from public.scheduling_bookings
   where company_id=$1::uuid and customer_id=$2::uuid and created_at >= $3::timestamptz
   order by created_at desc`,
  [COMPANY_ID, TRUSTED_CUSTOMER_ID, bookingStartedAt],
)).rows;
const booking = created[0] ?? null;

if (!createOk || !booking) {
  fail("create_booking", "create_booking / scheduling_bookings", {
    createTools: createTools.map((t) => ({ id: t.id, status: t.status, input: t.input, output: t.output })),
    bookings: created,
  });
}
if (booking.customer_id !== TRUSTED_CUSTOMER_ID) {
  fail("trusted_customer", "scheduling_bookings.customer_id", {
    expected: TRUSTED_CUSTOMER_ID, actual: booking.customer_id, bookingId: booking.id,
  });
}
if (booking.service_id !== SERVICE_ID) {
  fail("service_match", "scheduling_bookings.service_id", {
    expected: SERVICE_ID, actual: booking.service_id, bookingId: booking.id,
  });
}

report.results.booking = {
  pass: true,
  bookingId: booking.id,
  confirmationNumber: booking.confirmation_number,
  customerId: booking.customer_id,
  serviceId: booking.service_id,
  resourceId: booking.resource_id,
  startAt: booking.start_at,
  status: booking.status,
  createToolExecutionId: createOk.id,
};

// Cancel phase — bare ألغي (should be sole active booking)
const cancelStartedAt = new Date().toISOString();
const cancelTurn = await send("ألغي", "cancel_bare");
const cancelTools = await toolsSince(cancelStartedAt);
const searchCancel = cancelTools.filter((t) => t.tool_key === "search_bookings");
const cancelExec = cancelTools.filter((t) => t.tool_key === "cancel_booking");

const searchFound = searchCancel.some(
  (t) => Array.isArray(t.output?.bookings) &&
    t.output.bookings.some((b) => b.bookingId === booking.id || b.reference === booking.confirmation_number),
);

report.results.cancelSearch = {
  pass: searchFound,
  toolExecutionIds: searchCancel.map((t) => t.id),
  outputs: searchCancel.map((t) => ({
    id: t.id,
    total: t.output?.total,
    bookings: t.output?.bookings,
    customerFacingMessage: t.output?.customerFacingMessage,
  })),
};

if (!searchFound) {
  fail("search_bookings_trusted", "executeSearchBookings / createSearchBookingsTool", {
    expectedBookingId: booking.id,
    expectedReference: booking.confirmation_number,
    trustedCustomerId: TRUSTED_CUSTOMER_ID,
    searchCancel: searchCancel.map((t) => ({ id: t.id, input: t.input, output: t.output })),
    responseContent: cancelTurn.responseContent,
  });
}

const cancelOk = cancelExec.find((t) => t.output?.success === true);
if (!cancelOk) {
  fail("cancel_booking_executed", "cancel_booking / forceCancelBookingIfSelected", {
    cancelExec: cancelExec.map((t) => ({ id: t.id, input: t.input, output: t.output })),
    responseContent: cancelTurn.responseContent,
  });
}

const bookingAfter = (await c.query(
  `select id, confirmation_number, status, updated_at from public.scheduling_bookings where id=$1`,
  [booking.id],
)).rows[0];

if (bookingAfter?.status !== "cancelled") {
  fail("db_cancelled", "scheduling_bookings.status", {
    bookingId: booking.id, status: bookingAfter?.status, cancelToolExecutionId: cancelOk.id,
  });
}

report.results.cancel = {
  pass: true,
  bookingId: booking.id,
  confirmationNumber: booking.confirmation_number,
  status: bookingAfter.status,
  searchToolExecutionIds: searchCancel.map((t) => t.id),
  cancelToolExecutionId: cancelOk.id,
  cancelRuntimeExecutionId: cancelTurn.runtimeExecutionId,
  responseContent: cancelTurn.responseContent,
};

console.log(JSON.stringify(report, null, 2));
await c.end();
