/**
 * Local-only: apply migration 473 to local Supabase Postgres.
 * Never run against production.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "../lib/db/node_modules/pg/lib/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlPath = path.join(root, "supabase/migrations/473_sales_orders_role_permissions_backfill.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const connectionString =
  process.env.DATABASE_URL?.trim() || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

if (!/127\.0\.0\.1|localhost/.test(connectionString) || /supabase\.co|pooler\.supabase/i.test(connectionString)) {
  throw new Error("Refusing to apply migration 473 against a production DATABASE_URL.");
}

const c = new pg.Client({ connectionString });
await c.connect();
try {
  await c.query("begin");
  await c.query(sql);
  const templates = await c.query(`
    select template_key, permission_code
    from public.platform_role_template_permissions
    where permission_code like 'orders.%'
    order by 1, 2
  `);
  const defaults = await c.query(`
    select r.template_key, count(rp.permission_id)::int as orders_perms
    from public.roles r
    left join public.role_permissions rp on rp.role_id = r.id
    left join public.permissions p on p.id = rp.permission_id and p.code like 'orders.%'
    where r.role_type = 'DEFAULT' and r.company_id is not null
    group by r.template_key
    order by 1
  `);
  await c.query("commit");
  console.log(
    JSON.stringify(
      {
        ok: true,
        templates: templates.rows,
        defaultRoleOrderPermCounts: defaults.rows,
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
