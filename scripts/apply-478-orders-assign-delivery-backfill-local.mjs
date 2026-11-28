/**
 * Local-only: apply migration 478 and record schema_migrations.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const version = "478";
const migrationFile = "478_orders_assign_delivery_role_backfill.sql";
const connectionString =
  process.env.DATABASE_URL?.trim() || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

if (!/127\.0\.0\.1|localhost/.test(connectionString) || /supabase\.co|pooler\.supabase/i.test(connectionString)) {
  throw new Error("Refusing to apply migration 478 against a production DATABASE_URL.");
}

const sql = readFileSync(resolve(root, "supabase/migrations", migrationFile), "utf8");
const c = new pg.Client({ connectionString });
await c.connect();

const report = { migration: migrationFile, version, applied: false };
try {
  const existing = await c.query(
    `select version from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  if ((existing.rowCount ?? 0) > 0) {
    report.skipped = "already_applied";
  } else {
    await c.query("begin");
    await c.query(sql);
    await c.query(`insert into supabase_migrations.schema_migrations (version) values ($1)`, [version]);
    await c.query("commit");
    report.applied = true;
  }

  const demo = await c.query(
    `select r.name, exists (
       select 1 from public.role_permissions rp
       join public.permissions p on p.id = rp.permission_id
       where rp.role_id = r.id and p.code = 'orders.assign_delivery'
     ) as has_assign
     from public.roles r
     where r.id in (
       'd0000030-0001-4001-8001-000000000001',
       'd0000030-0001-4001-8001-000000000002',
       'd0000030-0001-4001-8001-000000000004',
       'd0000030-0001-4001-8001-000000000005'
     )
     order by r.name`,
  );
  report.demoRoles = demo.rows;
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  try {
    await c.query("rollback");
  } catch {
    /* ignore */
  }
  throw error;
} finally {
  await c.end();
}
