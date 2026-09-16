/**
 * Apply migration 368 — update_my_profile department_id (Phase 2).
 * Run: node scripts/apply-368-update-my-profile-department-id.mjs
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

const migrationName = "368_update_my_profile_department_id.sql";
const version = "368";
const sqlPath = resolve(root, "supabase/migrations", migrationName);
const sql = readFileSync(sqlPath, "utf8");

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
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
    `insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)`,
    [version, migrationName.replace(/\.sql$/, "")],
  );
  await client.query("commit");

  const sig = await client.query(`
    select pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'update_my_profile'
  `);

  const coverage = await client.query(`
    select
      count(*) filter (where is_active and company_id is not null)::int as active_company_employees,
      count(*) filter (where is_active and company_id is not null and department_id is not null)::int as with_department_id,
      count(*) filter (
        where is_active and company_id is not null
          and department_id is null
          and department is not null and length(trim(department)) > 0
      )::int as legacy_text_only,
      count(*) filter (
        where is_active and company_id is not null
          and department_id is null
          and (department is null or length(trim(department)) = 0)
      )::int as with_neither
    from public.profiles
  `);

  console.log(
    JSON.stringify(
      {
        ok: true,
        version,
        checksum,
        update_my_profile_args: sig.rows.map((r) => r.args),
        coverage: coverage.rows[0],
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
