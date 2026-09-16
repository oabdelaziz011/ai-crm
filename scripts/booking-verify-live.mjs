/**
 * Production Booking verification E2E (read/verify only; mutations only via WhatsApp tools).
 * Uses real Meta payload shape with phone_number_id.
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
const FROM = "201011404109";
const API = (process.env.VITE_API_SERVER_URL ?? env.VITE_API_SERVER_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const WEBHOOK = `${API}/api/webhooks/whatsapp/${CHANNEL_ID}`;
const WAIT = Number(process.env.WA_VERIFY_WAIT_MS ?? 95000);

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const report = {
  startedAt: new Date().toISOString(),
  webhook: WEBHOOK,
  phase: "booking",
  turns: [],
  stop: null,
  results: {},
};

function fail(step, layer, evidence) {
  report.stop = { step, layer, evidence };
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

async function send(text, label) {
  const wamid = `wamid.verify.${randomUUID()}`;
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                phone_number_id: PHONE_NUMBER_ID,
                display_phone_number: "201012345989",
              },
              contacts: [{ profile: { name: "Verify" }, wa_id: FROM }],
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
  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }
  const turn = {
    label,
    text,
    wamid,
    httpStatus: res.status,
    responseContent: parsed?.response?.result?.responseContent ?? null,
    inboundEventId: parsed?.response?.result?.inboundEventId ?? null,
    runtimeExecutionId: parsed?.response?.result?.runtimeExecutionId ?? null,
    outboundDeliveryId: parsed?.response?.result?.outboundDeliveryId ?? null,
    preview: body.slice(0, 900),
  };
  report.turns.push(turn);
  if (res.status !== 200) {
    fail(label, "webhook.http", { httpStatus: res.status, body: body.slice(0, 500) });
  }
  await new Promise((r) => setTimeout(r, WAIT));
  return turn;
}

async function toolsSince(sinceIso, conversationId) {
  return (
    await c.query(
      `select id, tool_key, status, input, output, started_at, completed_at
       from public.tool_executions
       where conversation_id = $1::uuid and started_at >= $2::timestamptz
       order by started_at`,
      [conversationId, sinceIso],
    )
  ).rows;
}

async function bookingsForCustomer(sinceIso) {
  return (
    await c.query(
      `select id, confirmation_number, status, service_id, resource_id, customer_id, start_at, end_at, created_at, updated_at
       from public.scheduling_bookings
       where company_id = $1::uuid and customer_id = $2::uuid
         and created_at >= $3::timestamptz
       order by created_at desc`,
      [COMPANY_ID, TRUSTED_CUSTOMER_ID, sinceIso],
    )
  ).rows;
}

// ── Cleanup leftovers so bare ألغي can auto-select sole new booking ──
report.phase = "cleanup_leftovers";
const leftovers = (
  await c.query(
    `select confirmation_number from public.scheduling_bookings
     where company_id = $1::uuid and customer_id = $2::uuid
       and deleted_at is null and status in ('pending','confirmed') and start_at > now()
     order by start_at`,
    [COMPANY_ID, TRUSTED_CUSTOMER_ID],
  )
).rows;
for (const row of leftovers) {
  await send(`ألغي ${row.confirmation_number}`, `cleanup_${row.confirmation_number}`);
}

const remaining = (
  await c.query(
    `select confirmation_number, status from public.scheduling_bookings
     where company_id = $1::uuid and customer_id = $2::uuid
       and deleted_at is null and status in ('pending','confirmed') and start_at > now()`,
    [COMPANY_ID, TRUSTED_CUSTOMER_ID],
  )
).rows;
if (remaining.length > 0) {
  fail("cleanup", "scheduling_bookings.active_future", { remaining });
}

// ── Steps 3–5: create booking ──
report.phase = "create_booking";
const bookingStartedAt = new Date().toISOString();

await send("عايز احجز", "intent");
const serviceTurn = await send("اسنان", "service_asnan");

const convId = "9de058d8-0a5e-4fbc-a8a7-bfa43ea3776b";
const availTools = (await toolsSince(bookingStartedAt, convId)).filter(
  (t) => t.tool_key === "search_availability" || t.tool_key === "find_next_available",
);
const lastAvail = availTools.at(-1);
const availOut = lastAvail?.output ?? {};
const slots =
  availOut?.resources?.[0]?.slots ??
  (Array.isArray(availOut?.availableDates) ? [] : []);

// Prefer first concrete slot from tool output; else parse response text fallback
let slotDate = null;
let slotStart = null;
if (Array.isArray(slots) && slots.length > 0) {
  slotDate = slots[0].date;
  slotStart = slots[0].start;
}

if (!slotDate || !slotStart) {
  // Fallback: use Arabic weekday phrasing from outbound if find_next returned a suggestion
  const content = serviceTurn.responseContent ?? "";
  if (/07:30|7:30|٧:٣٠/.test(content) && /الثلاثاء|ثلاثاء/.test(content)) {
    slotDate = "2026-08-25";
    slotStart = "19:30";
  }
}

if (!slotDate || !slotStart) {
  fail("service_asnan", "search_availability/find_next_available", {
    message: "No selectable slot found in tool output or response",
    availTool: lastAvail
      ? { id: lastAvail.id, tool_key: lastAvail.tool_key, output: lastAvail.output }
      : null,
    responseContent: serviceTurn.responseContent,
  });
}

// Convert HH:MM to Arabic-friendly selection matching offered slots
const [hh, mm] = slotStart.split(":").map(Number);
const hour12 = ((hh + 11) % 12) + 1;
const isPm = hh >= 12;
const arabicPeriod = isPm ? "مساء" : "صباح";
const slotText =
  mm === 0
    ? `${slotDate} الساعة ${hour12} ${arabicPeriod}`
    : `${slotDate} الساعة ${hour12}:${String(mm).padStart(2, "0")} ${arabicPeriod}`;

await send(slotText, "slot_select");
await send("201011404109", "phone_confirm");

const created = await bookingsForCustomer(bookingStartedAt);
const booking = created[0] ?? null;
const createTools = (await toolsSince(bookingStartedAt, convId)).filter(
  (t) => t.tool_key === "create_booking",
);
const createOk = createTools.find((t) => t.output?.success === true);

if (!createOk || !booking) {
  fail("create_booking", "create_booking / scheduling_bookings", {
    createTools: createTools.map((t) => ({
      id: t.id,
      status: t.status,
      output: t.output,
    })),
    bookings: created,
  });
}

if (booking.customer_id !== TRUSTED_CUSTOMER_ID) {
  fail("trusted_customer", "scheduling_bookings.customer_id", {
    expected: TRUSTED_CUSTOMER_ID,
    actual: booking.customer_id,
    bookingId: booking.id,
  });
}

if (booking.service_id !== SERVICE_ID) {
  fail("service_match", "scheduling_bookings.service_id", {
    expected: SERVICE_ID,
    actual: booking.service_id,
    bookingId: booking.id,
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
  createRuntimeExecutionId: report.turns.find((t) => t.label === "phone_confirm")?.runtimeExecutionId,
};

console.log(JSON.stringify({ ...report, next: "cancel_phase" }, null, 2));

// Persist for cancel phase
report.phase = "cancel";
const cancelStartedAt = new Date().toISOString();
const cancelTurn = await send("ألغي", "cancel_bare");

const cancelTools = await toolsSince(cancelStartedAt, convId);
const searchCancel = cancelTools.filter((t) => t.tool_key === "search_bookings");
const cancelExec = cancelTools.filter((t) => t.tool_key === "cancel_booking");

const searchFound = searchCancel.some(
  (t) =>
    Array.isArray(t.output?.bookings) &&
    t.output.bookings.some(
      (b) => b.bookingId === booking.id || b.reference === booking.confirmation_number,
    ),
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
    searchCancel,
    responseContent: cancelTurn.responseContent,
  });
}

const cancelOk = cancelExec.find((t) => t.output?.success === true);
if (!cancelOk) {
  fail("cancel_booking_executed", "cancel_booking / forceCancelBookingIfSelected", {
    cancelExec: cancelExec.map((t) => ({ id: t.id, output: t.output })),
    responseContent: cancelTurn.responseContent,
    note: "Bare ألغي did not execute successful cancel_booking",
  });
}

const bookingAfter = (
  await c.query(
    `select id, confirmation_number, status, updated_at from public.scheduling_bookings where id = $1`,
    [booking.id],
  )
).rows[0];

if (bookingAfter?.status !== "cancelled") {
  fail("db_cancelled", "scheduling_bookings.status", {
    bookingId: booking.id,
    status: bookingAfter?.status,
    cancelToolExecutionId: cancelOk.id,
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
