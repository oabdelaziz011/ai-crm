/**
 * Forensic probe: duplicate welcome + booking reference 927AA3F5
 */
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url));
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const FROM = "201011404109";
const CONV_ID = "9de058d8-0a5e-4fbc-a8a7-bfa43ea3776b";

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const session = (await c.query(
  `select id, conversation_id, company_channel_id, sender_external_id, metadata, created_at, updated_at
   from public.channel_sessions
   where company_id=$1 and sender_external_id=$2
   order by updated_at desc limit 3`,
  [COMPANY_ID, FROM],
)).rows;

const msgs = (await c.query(
  `select id, message_type, left(content, 500) as content, external_message_id, metadata, created_at
   from public.conversation_messages
   where conversation_id=$1::uuid
   order by created_at desc
   limit 40`,
  [CONV_ID],
)).rows;

const welcomeMsgs = (await c.query(
  `select id, message_type, content, external_message_id, metadata, created_at
   from public.conversation_messages
   where conversation_id=$1::uuid
     and (
       content ilike '%أهلاً يا بيك%'
       or content ilike '%مساء النور%'
       or content ilike '%مساء الخير%'
       or content ilike '%كيف يمكنني مساعدتك%'
     )
   order by created_at desc
   limit 30`,
  [CONV_ID],
)).rows;

const refHits = (await c.query(
  `select id, tool_key, status, input, output, started_at, completed_at, conversation_id
   from public.tool_executions
   where company_id=$1::uuid
     and (
       output::text ilike '%927AA3F5%'
       or output::text ilike '%927aa3f5%'
       or input::text ilike '%927AA3F5%'
     )
   order by started_at desc
   limit 20`,
  [COMPANY_ID],
)).rows;

const bookingByRef = (await c.query(
  `select id, confirmation_number, status, service_id, resource_id, customer_id, start_at, created_at, source
   from public.scheduling_bookings
   where company_id=$1::uuid
     and (
       confirmation_number ilike '%927AA3F5%'
       or id::text ilike '927aa3f5%'
       or left(replace(id::text, '-', ''), 8) ilike '927aa3f5'
     )
   order by created_at desc
   limit 10`,
  [COMPANY_ID],
)).rows;

const booking0730 = (await c.query(
  `select id, confirmation_number, status, service_id, resource_id, customer_id, start_at, created_at, source
   from public.scheduling_bookings
   where company_id=$1::uuid
     and start_at = '2026-08-25T16:30:00.000Z'
   order by created_at desc
   limit 10`,
  [COMPANY_ID],
)).rows;

const msgsWithRef = (await c.query(
  `select id, message_type, content, created_at, metadata
   from public.conversation_messages
   where conversation_id=$1::uuid and content ilike '%927AA3F5%'
   order by created_at desc
   limit 10`,
  [CONV_ID],
)).rows;

const createBookings = (await c.query(
  `select id, tool_key, status, input, output, started_at
   from public.tool_executions
   where conversation_id=$1::uuid and tool_key='create_booking'
   order by started_at desc
   limit 15`,
  [CONV_ID],
)).rows;

console.log(JSON.stringify({
  session,
  welcomeMsgs,
  recentMsgs: msgs,
  refHits,
  bookingByRef,
  booking0730,
  msgsWithRef,
  createBookings: createBookings.map((t) => ({
    id: t.id,
    status: t.status,
    started_at: t.started_at,
    input: t.input,
    output: {
      success: t.output?.success,
      bookingId: t.output?.bookingId,
      bookingRef: t.output?.bookingRef,
      reference: t.output?.reference,
      confirmationNumber: t.output?.confirmationNumber,
      customerFacingMessage: t.output?.customerFacingMessage,
      status: t.output?.status,
      startAt: t.output?.startAt,
    },
  })),
}, null, 2));

await c.end();
