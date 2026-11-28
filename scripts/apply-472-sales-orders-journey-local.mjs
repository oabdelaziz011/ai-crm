/**
 * Local-only: apply migration 472 to the local Supabase Postgres.
 * Never run against production.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "../lib/db/node_modules/pg/lib/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlPath = path.join(root, "supabase/migrations/472_sales_orders_journey_enrichment.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const c = new pg.Client({
  connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
await c.connect();
await c.query(sql);
const cols = await c.query(`
  select column_name from information_schema.columns
  where table_schema='public' and table_name='sales_orders'
    and column_name in ('ai_employee_id','assigned_salesperson_id','payment_status','confirmation_fingerprint')
  order by 1
`);
const tools = await c.query(`
  select key from public.tool_definitions
  where key in ('validate_delivery_zone','preview_sales_order','create_sales_order')
  order by 1
`);
console.log(JSON.stringify({ ok: true, columns: cols.rows.map((r) => r.column_name), tools: tools.rows.map((r) => r.key) }, null, 2));
await c.end();
