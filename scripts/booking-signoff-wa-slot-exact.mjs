/** One-shot create_booking attempt with exact listed slot. */
import { randomUUID } from "node:crypto";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url));
const COMPANY_ID = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const CHANNEL_ID = "e126113b-6d0e-48d3-9296-a46aafe0cc75";
const FROM = "201011404109";
const API = (env.VITE_API_SERVER_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const URL = `${API}/api/webhooks/whatsapp/${CHANNEL_ID}`;
const WAIT = 100000;
const startedAt = new Date().toISOString();

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

async function send(text) {
  const wamid = `wamid.signoff.${randomUUID()}`;
  const payload = {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: {
      messaging_product: "whatsapp", metadata: { display_phone_number: "201012345989" },
      contacts: [{ profile: { name: "S" }, wa_id: FROM }],
      messages: [{ from: FROM, id: wamid, timestamp: String(Math.floor(Date.now()/1000)), type: "text", text: { body: text } }],
    }}]}],
  };
  const res = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const body = await res.text();
  console.log("TURN", text, res.status, body.slice(0, 500));
  await new Promise((r) => setTimeout(r, WAIT));
}

await send("عايز احجز عيادة");
await send("الثلاثاء 25 أغسطس 7:15 مساء");

const conv = (await c.query(`select conversation_id from public.channel_sessions where company_id=$1 and sender_external_id=$2 limit 1`, [COMPANY_ID, FROM])).rows[0]?.conversation_id;
const tools = conv ? (await c.query(`select tool_key, status, left(output::text,600) output from public.tool_executions where conversation_id=$1 and started_at >= $2 order by started_at`, [conv, startedAt])).rows : [];
const bookings = (await c.query(`select id, confirmation_number, status, start_at, created_at from public.scheduling_bookings where company_id=$1 and created_at >= $2`, [COMPANY_ID, startedAt])).rows;
console.log(JSON.stringify({ tools, bookings }, null, 2));
await c.end();
