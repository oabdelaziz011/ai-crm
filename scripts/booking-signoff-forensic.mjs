/**
 * Read-only forensic capture for booking sign-off window.
 */
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url));
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const FROM = process.argv[2] ?? "201011404109";
const SINCE = process.argv[3] ?? "2026-08-24T19:00:00Z";

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const session = await c.query(
  `select conversation_id from public.channel_sessions
   where company_id=$1 and sender_external_id=$2 order by updated_at desc limit 1`,
  [COMPANY_ID, FROM],
);
const conversationId = session.rows[0]?.conversation_id ?? null;

const inbounds = await c.query(
  `select id, external_message_id, incoming_message_id, runtime_execution_id, processing_status, error_message, created_at, payload
   from public.channel_inbound_events
   where company_id=$1::uuid and sender_external_id=$2 and created_at >= $3::timestamptz
   order by created_at`,
  [COMPANY_ID, FROM, SINCE],
);

let messages = [];
let runtimes = [];
let tools = [];
let deliveries = [];
let bookings = [];

if (conversationId) {
  messages = (
    await c.query(
      `select id, message_type, left(content, 400) as content, external_message_id, created_at, metadata
       from public.conversation_messages
       where conversation_id=$1::uuid and created_at >= $2::timestamptz
       order by created_at`,
      [conversationId, SINCE],
    )
  ).rows;
  runtimes = (
    await c.query(
      `select id, status, created_at, completed_at, metadata
       from public.runtime_executions
       where conversation_id=$1::uuid and created_at >= $2::timestamptz
       order by created_at`,
      [conversationId, SINCE],
    )
  ).rows;
  tools = (
    await c.query(
      `select id, tool_key, status, input, output, started_at, completed_at
       from public.tool_executions
       where conversation_id=$1::uuid and started_at >= $2::timestamptz
       order by started_at`,
      [conversationId, SINCE],
    )
  ).rows;
  deliveries = (
    await c.query(
      `select id, delivery_status, error_message, created_at, left((payload->>'text')::text, 400) as text_preview
       from public.channel_delivery_events
       where company_id=$1::uuid and conversation_id=$2::uuid and created_at >= $3::timestamptz
       order by created_at`,
      [COMPANY_ID, conversationId, SINCE],
    )
  ).rows;
}

bookings = (
  await c.query(
    `select id, confirmation_number, status, service_id, resource_id, customer_id, scheduled_start_at, created_at, updated_at
     from public.scheduling_bookings
     where company_id=$1::uuid and created_at >= $2::timestamptz
     order by created_at desc`,
    [COMPANY_ID, SINCE],
  )
).rows;

console.log(
  JSON.stringify(
    {
      since: SINCE,
      from: FROM,
      conversationId,
      inbounds: inbounds.rows.map((r) => ({
        id: r.id,
        wamid: r.external_message_id,
        incoming_message_id: r.incoming_message_id,
        runtime_execution_id: r.runtime_execution_id,
        processing_status: r.processing_status,
        error_message: r.error_message,
        created_at: r.created_at,
        text: r.payload?.message?.text?.body ?? null,
      })),
      messages,
      runtimes,
      tools,
      deliveries,
      bookings,
      idempotency: {
        inboundCount: inbounds.rows.length,
        allHaveIncomingMessageId: inbounds.rows.every((r) => r.incoming_message_id),
        runtimeCount: runtimes.length,
        outboundMessages: messages.filter((m) => m.message_type === "outgoing").length,
      },
    },
    null,
    2,
  ),
);

await c.end();
