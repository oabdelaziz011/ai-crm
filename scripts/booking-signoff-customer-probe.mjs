import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url));
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const booking = await c.query(
  `select b.*, cu.phone, cu.name from public.scheduling_bookings b
   join public.customers cu on cu.id = b.customer_id where b.id = $1`,
  ["65265043-9684-4164-8e0b-49bb45f6f001"],
);
const byPhone = await c.query(
  `select id, phone, name from public.customers
   where company_id = '2d27f7fb-c15e-4d60-84e9-1793f36f2172'
   and (phone = '201011404109' or phone like '%11011404109%')`,
);
const convCustomer = await c.query(
  `select customer_id from public.conversations where id = '9de058d8-0a5e-4fbc-a8a7-bfa43ea3776b'`,
);

console.log(JSON.stringify({ booking: booking.rows[0], customersByPhone: byPhone.rows, conversationCustomerId: convCustomer.rows[0] }, null, 2));
await c.end();
