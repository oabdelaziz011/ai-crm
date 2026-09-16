import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url));
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const msgs = (await c.query(
  `select id, message_type, left(content,200) content, metadata, created_at
   from public.conversation_messages
   where conversation_id='9de058d8-0a5e-4fbc-a8a7-bfa43ea3776b'
     and created_at between '2026-08-25T12:40:00Z' and '2026-08-25T12:49:20Z'
   order by created_at`,
)).rows;

const inbounds = (await c.query(
  `select id, external_message_id, incoming_message_id, runtime_execution_id, processing_status, created_at, error_message
   from public.channel_inbound_events
   where company_id='2d27f7fb-c15e-4d60-84e9-1793f36f2172'
     and created_at between '2026-08-25T12:40:00Z' and '2026-08-25T12:50:00Z'
   order by created_at`,
)).rows;

console.log(JSON.stringify({ msgs, inbounds }, null, 2));
await c.end();
