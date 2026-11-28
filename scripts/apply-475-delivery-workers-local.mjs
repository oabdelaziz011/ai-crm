/**
 * Local-only: apply migration 475 to local Supabase Postgres.
 * Never run against production.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "../lib/db/node_modules/pg/lib/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlPath = path.join(root, "supabase/migrations/475_delivery_workers_and_order_enrichment.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const connectionString =
  process.env.DATABASE_URL?.trim() || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

if (!/127\.0\.0\.1|localhost/.test(connectionString) || /supabase\.co|pooler\.supabase/i.test(connectionString)) {
  throw new Error("Refusing to apply migration 475 against a production DATABASE_URL.");
}

const c = new pg.Client({ connectionString });
await c.connect();
try {
  await c.query("begin");
  await c.query(sql);
  const tables = await c.query(`
    select to_regclass('public.company_delivery_workers') as workers,
           to_regclass('public.company_delivery_worker_zones') as zones
  `);
  const cols = await c.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'sales_orders'
      and column_name in (
        'assigned_delivery_worker_id', 'customer_secondary_phone',
        'eta_min_snapshot', 'eta_max_snapshot', 'eta_unit_snapshot'
      )
    order by 1
  `);
  const perm = await c.query(`
    select code from public.permissions where code = 'orders.assign_delivery'
  `);
  await c.query("commit");
  console.log(
    JSON.stringify(
      {
        ok: true,
        workers: tables.rows[0]?.workers,
        zones: tables.rows[0]?.zones,
        salesOrderColumns: cols.rows.map((r) => r.column_name),
        permission: perm.rows[0]?.code ?? null,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await c.query("rollback");
  throw error;
} finally {
  await c.end();
}
