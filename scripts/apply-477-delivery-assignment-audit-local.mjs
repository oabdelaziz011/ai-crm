/**
 * Local-only: apply migration 477 to local Supabase Postgres.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "../lib/db/node_modules/pg/lib/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlPath = path.join(
  root,
  "supabase/migrations/477_delivery_assignment_audit_and_notify.sql",
);
const sql = fs.readFileSync(sqlPath, "utf8");

const connectionString =
  process.env.DATABASE_URL?.trim() || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

if (!/127\.0\.0\.1|localhost/.test(connectionString) || /supabase\.co|pooler\.supabase/i.test(connectionString)) {
  throw new Error("Refusing to apply migration 477 against a production DATABASE_URL.");
}

const c = new pg.Client({ connectionString });
await c.connect();
try {
  await c.query("begin");
  await c.query(sql);
  const cols = await c.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'sales_orders'
      and column_name in (
        'assignment_pending_reason',
        'delivery_assignment_mode_applied',
        'delivery_notify_status',
        'delivery_notify_message_id',
        'delivery_notify_error',
        'delivery_notify_idempotency_key',
        'delivery_notify_attempted_at'
      )
    order by 1
  `);
  const table = await c.query(`
    select to_regclass('public.sales_order_delivery_assignments') as assignments
  `);
  await c.query("commit");
  console.log(
    JSON.stringify(
      {
        ok: true,
        columns: cols.rows.map((r) => r.column_name),
        assignments: table.rows[0]?.assignments,
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
