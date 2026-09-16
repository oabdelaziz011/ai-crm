/**
 * Query forensic evidence for booking sign-off conversation.
 */
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url));
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const FROM = process.env.WA_SIGNOFF_FROM ?? "201011404109";
const since = process.argv[2] ?? new Date(Date.now() - 30 * 60 * 1000).toISOString();

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const session = await c.query(
  `select conversation_id, updated_at from public.channel_sessions where company_id=$1 and sender_external_id=$2 order by updated_at desc limit 1`,
  [COMPANY_ID, FROM],
);
const conversationId = session.rows[0]?.conversation_id;

const inbounds = await c.query(
  `select id, external_message_id, incoming_message_id, runtime_execution_id, processing_status, error_message, created_at
   from public.channel_inbound_events
   where company_id=$1::uuid and company_channel_id=$2::uuid and created_at >= $3::timestamptz order by created_at desc limit 20`,
  [COMPANY_ID, CHANNEL_ID, since],
);

let messages = [], runtimes = [], tools = [], deliveries = [], bookings = [];
if (conversationId) {
  messages = (
    await c.query(
      `select id, message_type, left(content, 600) as content, external_message_id, created_at
       from public.conversation_messages where conversation_id=$1::uuid and created_at >= $2::timestamptz order by created_at`,
      [conversationId, since],
    )
  ).rows;
  runtimes = (
    await c.query(
      `select id, execution_status, created_at, updated_at, conversation_id, error_message
       from public.runtime_executions where conversation_id=$1::uuid and created_at >= $2::timestamptz order by created_at`,
      [conversationId, since],
    )
  ).rows;
  tools = (
    await c.query(
      `select id, tool_key, status, left(input::text, 300) as input, left(output::text, 400) as output, started_at, completed_at
       from public.tool_executions where conversation_id=$1::uuid and started_at >= $2::timestamptz order by started_at`,
      [conversationId, since],
    )
  ).rows;
  deliveries = (
    await c.query(
      `select id, delivery_status, error_message, created_at, left((payload->>'text')::text, 500) as text_preview
       from public.channel_delivery_events
       where company_id=$1::uuid and conversation_id=$2::uuid and created_at >= $3::timestamptz order by created_at`,
      [COMPANY_ID, conversationId, since],
    )
  ).rows;
}

bookings = (
  await c.query(
    `select id, confirmation_number, status, service_id, resource_id, customer_id, scheduled_start_at, created_at
     from public.scheduling_bookings where company_id=$1::uuid and created_at >= $2::timestamptz order by created_at desc`,
    [COMPANY_ID, since],
  )
).rows;

console.log(
  JSON.stringify(
    { since, conversationId, inbounds: inbounds.rows, messages, runtimes, tools, deliveries, bookings },
    null,
    2,
  ),
);
await c.end();
