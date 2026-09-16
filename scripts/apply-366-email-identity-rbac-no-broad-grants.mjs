/**
 * Apply ONLY migration 366 (retract 365 role/template grants; Connection gate).
 *
 * Run: node scripts/apply-366-email-identity-rbac-no-broad-grants.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const VALUEOR = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root, { hydrateProcessEnv: false });
if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL missing");

const migrationName = "366_email_identity_rbac_no_broad_grants.sql";
const version = "366";
const sqlPath = resolve(root, "supabase/migrations", migrationName);
const sql = readFileSync(sqlPath, "utf8");

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

  const catalog = await client.query(
    `select code from public.permissions
     where code in ('email.settings.manage', 'email.identity.manage', 'email.identity.company.manage')
     order by code`,
  );
  const grants = await client.query(
    `select p.code, count(rp.role_id)::int as role_grants
     from public.permissions p
     left join public.role_permissions rp on rp.permission_id = p.id
     where p.code in ('email.settings.manage', 'email.identity.manage', 'email.identity.company.manage')
     group by p.code
     order by p.code`,
  );
  const templates = await client.query(
    `select count(*)::int as n
     from public.platform_role_template_permissions
     where permission_code in ('email.settings.manage', 'email.identity.manage', 'email.identity.company.manage')`,
  );
  const adminTabs = await client.query(
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
  const superAdminNew = await client.query(
    `select count(*)::int as n
     from public.roles r
     join public.role_permissions rp on rp.role_id = r.id
     join public.permissions p on p.id = rp.permission_id
     where r.company_id = $1
       and r.is_system is true
       and r.name = 'Super Admin'
       and p.code in ('email.settings.manage', 'email.identity.manage', 'email.identity.company.manage')`,
    [VALUEOR],
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        version,
        checksum,
        catalog: catalog.rows.map((row) => row.code),
        grants: grants.rows,
        templateGrants: templates.rows[0].n,
        valueorAdminTabCodes: adminTabs.rows.map((row) => row.code),
        superAdminNewIdentityGrants: superAdminNew.rows[0].n,
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
