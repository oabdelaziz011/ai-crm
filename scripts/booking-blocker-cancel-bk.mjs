import { randomUUID } from "node:crypto";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url));
const FROM = "201011404109";
const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const PHONE_NUMBER_ID = "1214681355059951";
const API = "http://127.0.0.1:3000";
const BOOKING_ID = "d8d692e9-7df3-4c97-8beb-47c155c91f84";
const startedAt = new Date().toISOString();

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const wamid = `wamid.live.${randomUUID()}`;
const payload = {
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: {
    messaging_product: "whatsapp",
    metadata: { phone_number_id: PHONE_NUMBER_ID, display_phone_number: "201012345989" },
    contacts: [{ profile: { name: "T" }, wa_id: FROM }],
    messages: [{ from: FROM, id: wamid, timestamp: "1", type: "text", text: { body: "ألغي BK-000043" } }],
  }}]}],
};
const res = await fetch(`${API}/api/webhooks/whatsapp/${CHANNEL_ID}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
});
console.log("HTTP", res.status, (await res.text()).slice(0, 600));
await new Promise((r) => setTimeout(r, 90000));

const booking = (await c.query(`select id, confirmation_number, status, updated_at from public.scheduling_bookings where id=$1`, [BOOKING_ID])).rows[0];
const conv = (await c.query(`select conversation_id from public.channel_sessions where sender_external_id=$1 limit 1`, [FROM])).rows[0]?.conversation_id;
const tools = conv ? (await c.query(`select tool_key, status, left(output::text,400) output from public.tool_executions where conversation_id=$1 and started_at >= $2 order by started_at`, [conv, startedAt])).rows : [];
console.log(JSON.stringify({ booking, tools }, null, 2));
await c.end();
