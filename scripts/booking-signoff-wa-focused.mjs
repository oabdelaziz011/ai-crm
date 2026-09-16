/**
 * Focused create_booking attempt — عيادة only, provides phone when asked.
 */
import { randomUUID } from "node:crypto";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url));
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const FROM = "201011404109";
const API_BASE = (env.VITE_API_SERVER_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const WEBHOOK_URL = `${API_BASE}/api/webhooks/whatsapp/${CHANNEL_ID}`;
const WAIT = 95000;

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const startedAt = new Date().toISOString();
const turns = [];

async function send(text, label) {
  const wamid = `wamid.signoff.${randomUUID()}`;
  const payload = {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: {
      messaging_product: "whatsapp",
      metadata: { display_phone_number: "201012345989" },
      contacts: [{ profile: { name: "Signoff" }, wa_id: FROM }],
      messages: [{ from: FROM, id: wamid, timestamp: String(Math.floor(Date.now()/1000)), type: "text", text: { body: text } }],
    }}]}],
  };
  const res = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const body = await res.text();
  turns.push({ label, text, httpStatus: res.status, preview: body.slice(0, 600) });
  await new Promise((r) => setTimeout(r, WAIT));
}

await send("عايز احجز عيادة", "intent_service");
await send("الأحد 30 أغسطس 9 مساء", "slot");
await send("201011404109", "phone");
await send("ألغي", "cancel");

const session = await c.query(`select conversation_id from public.channel_sessions where company_id=$1 and sender_external_id=$2 order by updated_at desc limit 1`, [COMPANY_ID, FROM]);
const convId = session.rows[0]?.conversation_id;

const tools = convId ? (await c.query(
  `select tool_key, status, left(input::text,300) input, left(output::text,500) output, started_at
   from public.tool_executions where conversation_id=$1::uuid and started_at >= $2::timestamptz order by started_at`, [convId, startedAt]
)).rows : [];

const bookings = (await c.query(
  `select id, confirmation_number, status, service_id, resource_id, customer_id, start_at, created_at, updated_at
   from public.scheduling_bookings where company_id=$1::uuid and (created_at >= $2::timestamptz or updated_at >= $2::timestamptz) order by created_at desc`, [COMPANY_ID, startedAt]
)).rows;

const msgs = convId ? (await c.query(
  `select message_type, left(content,400) content, created_at from public.conversation_messages
   where conversation_id=$1::uuid and created_at >= $2::timestamptz order by created_at`, [convId, startedAt]
)).rows : [];

console.log(JSON.stringify({ startedAt, convId, turns, tools, bookings, msgs }, null, 2));
await c.end();
