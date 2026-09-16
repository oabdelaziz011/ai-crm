import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url));
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const BOOKING_ID = "64a32edf-8771-472c-b25d-8e17487f47d1";
const RUNTIME_ID = "ce562d54-99bb-4c13-a52a-d7b093af8a81";
const CONV_ID = "9de058d8-0a5e-4fbc-a8a7-bfa43ea3776b";
const CREATE_TOOL_ID = "c0034d87-5cf0-4c01-9669-152b62839b8a";

const booking = (await c.query(
  `select id, confirmation_number, status, customer_id, service_id, resource_id, start_at, created_at, updated_at
   from public.scheduling_bookings where id=$1`, [BOOKING_ID],
)).rows[0];

const createTool = (await c.query(
  `select id, tool_key, status, input, output, started_at from public.tool_executions where id=$1`,
  [CREATE_TOOL_ID],
)).rows[0];

const cancelRuntimeTools = (await c.query(
  `select id, tool_key, status, left(input::text,500) as input, left(output::text,800) as output, started_at
   from public.tool_executions
   where conversation_id=$1::uuid and started_at >= (
     select created_at from public.runtime_executions where id=$2::uuid
   ) - interval '2 seconds'
   and started_at <= (
     select coalesce(updated_at, created_at) from public.runtime_executions where id=$2::uuid
   ) + interval '2 seconds'
   order by started_at`,
  [CONV_ID, RUNTIME_ID],
)).rows;

const recentTools = (await c.query(
  `select id, tool_key, status, left(input::text,300) as input, left(output::text,400) as output, started_at
   from public.tool_executions
   where conversation_id=$1::uuid and started_at >= $2::timestamptz
   order by started_at`,
  [CONV_ID, "2026-08-25T13:06:00.000Z"],
)).rows;

const msgs = (await c.query(
  `select id, message_type, left(content,400) as content, created_at
   from public.conversation_messages
   where conversation_id=$1::uuid and created_at >= $2::timestamptz
   order by created_at`,
  [CONV_ID, "2026-08-25T13:06:00.000Z"],
)).rows;

const inbound = (await c.query(
  `select id, external_message_id, incoming_message_id, runtime_execution_id, processing_status, company_channel_id
   from public.channel_inbound_events where runtime_execution_id=$1`,
  [RUNTIME_ID],
)).rows[0];

const conversation = (await c.query(
  `select id, customer_id from public.conversations where id=$1`, [CONV_ID],
)).rows[0];

console.log(JSON.stringify({
  booking,
  conversation,
  createTool: createTool ? { id: createTool.id, tool_key: createTool.tool_key, status: createTool.status, input: createTool.input, output: createTool.output } : null,
  cancelRuntimeId: RUNTIME_ID,
  cancelRuntimeTools,
  recentTools,
  msgs,
  inbound,
}, null, 2));

await c.end();
