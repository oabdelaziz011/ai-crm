/**
 * Apply ONLY migration 364 (ValueOR DEFAULT Admin Email Workspace tab grants).
 *
 * Run: node scripts/apply-364-valueor-admin-email-tab-permissions.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root, { hydrateProcessEnv: false });
if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL missing");

const migrationName = "364_valueor_admin_email_tab_permissions.sql";
const version = "364";
const sqlPath = resolve(root, "supabase/migrations", migrationName);
const sql = readFileSync(sqlPath, "utf8");
const VALUEOR = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";

const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  const existing = await client.query(
    `select version, name from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  if (existing.rows.length > 0) {
    console.log(JSON.stringify({ ok: true, skipped: true, version, name: existing.rows[0].name }));
    await client.end();
    process.exit(0);
  }

  await client.query("begin");
  await client.query(sql);
  const checksum = createHash("sha256").update(sql).digest("hex");
  await client.query(
    `insert into supabase_migrations.schema_migrations (version, name)
     values ($1, $2)`,
    [version, migrationName.replace(/\.sql$/, "")],
  );
  await client.query("commit");

  const adminGrants = await client.query(
    `select p.code
     from public.roles r
     join public.role_permissions rp on rp.role_id = r.id
     join public.permissions p on p.id = rp.permission_id
     where r.company_id = $1
       and r.role_type = 'DEFAULT'
       and r.template_key = 'admin'
       and p.code in ('email.templates.view', 'email.routing.view', 'ai.email.manage')
     order by p.code`,
    [VALUEOR],
  );
  const otherGrants = await client.query(
    `select count(*)::int as n
     from public.role_permissions rp
     join public.roles r on r.id = rp.role_id
     join public.permissions p on p.id = rp.permission_id
     where p.code in ('email.templates.view', 'email.routing.view')
       and not (
         r.company_id = $1
         and r.role_type = 'DEFAULT'
         and r.template_key = 'admin'
       )`,
    [VALUEOR],
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        version,
        checksum,
        valueorAdminCodes: adminGrants.rows.map((row) => row.code),
        otherNewTabGrants: otherGrants.rows[0].n,
      },
      null,
      2,
    ),
  );
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    // ignore
  }
  console.error(error);
  process.exit(1);
} finally {
  await client.end();
}
