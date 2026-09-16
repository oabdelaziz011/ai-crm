import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url));
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const CONV = "9de058d8-0a5e-4fbc-a8a7-bfa43ea3776b";

const window = (await c.query(
  `select id, message_type, content, metadata, created_at
   from public.conversation_messages
   where conversation_id=$1::uuid
     and created_at between '2026-08-25T12:48:00Z' and '2026-08-25T12:50:30Z'
   order by created_at`,
  [CONV],
)).rows;

const booking = (await c.query(
  `select id, confirmation_number, status, start_at, service_id, created_at
   from public.scheduling_bookings where id='927aa3f5-4812-4dd5-8666-db7610fb6cdf'`,
)).rows[0];

const tool = (await c.query(
  `select id, input, output, started_at from public.tool_executions
   where output->>'bookingId' = '927aa3f5-4812-4dd5-8666-db7610fb6cdf'
      or output::text ilike '%927aa3f5%'
   order by started_at desc limit 5`,
)).rows;

const msgRef = (await c.query(
  `select id, content, created_at, metadata from public.conversation_messages
   where conversation_id=$1 and content ilike '%927AA3F5%'`,
  [CONV],
)).rows;

const runtime = (await c.query(
  `select id, execution_status, created_at, metadata, error_message
   from public.runtime_executions where id='4fe6fec3-8527-4445-a8b1-ec8b2617bfa6'`,
)).rows[0];

console.log(JSON.stringify({ window, booking, tool, msgRef, runtime }, null, 2));
await c.end();
