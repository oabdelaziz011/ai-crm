/**
 * Local-only: apply migration 476 to local Supabase Postgres.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "../lib/db/node_modules/pg/lib/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlPath = path.join(
  root,
  "supabase/migrations/476_delivery_zone_aliases_and_assignment_mode.sql",
);
const sql = fs.readFileSync(sqlPath, "utf8");

const connectionString =
  process.env.DATABASE_URL?.trim() || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

if (!/127\.0\.0\.1|localhost/.test(connectionString) || /supabase\.co|pooler\.supabase/i.test(connectionString)) {
  throw new Error("Refusing to apply migration 476 against a production DATABASE_URL.");
}

const COMPANY = "d0000010-0001-4001-8001-000000000002";
const c = new pg.Client({ connectionString });
await c.connect();
try {
  await c.query("begin");
  await c.query(sql);
  await c.query(
    `update public.company_delivery_zones
     set aliases = array['مدينة نصر', 'مدينه نصر']
     where company_id = $1 and lower(zone_name) = 'nasr city'`,
    [COMPANY],
  );
  await c.query(
    `update public.company_delivery_zones
     set aliases = array['المعادي', 'المعادى']
     where company_id = $1 and lower(zone_name) = 'maadi'`,
    [COMPANY],
  );
  const cols = await c.query(`
    select column_name from information_schema.columns
    where table_schema='public' and table_name='company_delivery_zones' and column_name='aliases'
    union all
    select column_name from information_schema.columns
    where table_schema='public' and table_name='company_order_settings' and column_name='delivery_assignment_mode'
  `);
  const zones = await c.query(
    `select zone_name, aliases from public.company_delivery_zones where company_id=$1 order by zone_name`,
    [COMPANY],
  );
  await c.query("commit");
  console.log(JSON.stringify({ ok: true, columns: cols.rows.map((r) => r.column_name), zones: zones.rows }, null, 2));
} catch (error) {
  await c.query("rollback");
  throw error;
} finally {
  await c.end();
}
