import { randomUUID } from "node:crypto";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url));
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const FROM = "201011404109";
const API = (env.VITE_API_SERVER_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const startedAt = new Date().toISOString();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const wamid = `wamid.signoff.${randomUUID()}`;
const payload = {
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { display_phone_number: "201012345989" },
    contacts: [{ profile: { name: "Signoff" }, wa_id: FROM }],
    messages: [{ from: FROM, id: wamid, timestamp: String(Math.floor(Date.now()/1000)), type: "text", text: { body: "201011404109" } }],
  }}]}],
};
const res = await fetch(`${API}/api/webhooks/whatsapp/${CHANNEL_ID}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
console.log("HTTP", res.status, (await res.text()).slice(0, 700));
await new Promise((r) => setTimeout(r, 95000));

const conv = (await c.query(`select conversation_id from public.channel_sessions where company_id=$1 and sender_external_id=$2 limit 1`, [COMPANY_ID, FROM])).rows[0]?.conversation_id;
const tools = conv ? (await c.query(`select tool_key, status, left(input::text,400) input, left(output::text,700) output, started_at from public.tool_executions where conversation_id=$1 and started_at >= $2 order by started_at`, [conv, startedAt])).rows : [];
const bookings = (await c.query(`select id, confirmation_number, status, service_id, resource_id, customer_id, start_at, created_at from public.scheduling_bookings where company_id=$1 and created_at >= $2 order by created_at desc`, [COMPANY_ID, startedAt])).rows;
const msgs = conv ? (await c.query(`select message_type, left(content,500) content from public.conversation_messages where conversation_id=$1 and created_at >= $2 order by created_at`, [conv, startedAt])).rows : [];
console.log(JSON.stringify({ tools, bookings, msgs }, null, 2));
await c.end();
