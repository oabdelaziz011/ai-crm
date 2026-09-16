/**
 * Apply + verify migration 371 (Phase 6D Step 2 conversation visibility RLS).
 * Run: node scripts/apply-and-verify-371-conversation-visibility.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";

const root = resolve("D:/ValueOR/project");
const env = loadProjectEnv(root, { hydrateProcessEnv: true, mergeProcessEnv: true });
if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL missing");

const version = "371";
const migrationName = "371_conversation_department_visibility_rls.sql";
const sql = readFileSync(resolve(root, "supabase/migrations", migrationName), "utf8");

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

try {
  const exists = await c.query(
    `select 1 from supabase_migrations.schema_migrations where version = $1`,
    [version],
  );
  await c.query(sql);
  if (exists.rowCount === 0) {
    await c.query(
      `insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)`,
      [version, migrationName],
    );
    console.log("APPLIED_371");
  } else {
    console.log("371_IDEMPOTENT_REAPPLY");
  }

  const helpers = await c.query(`
    select p.proname, n.nspname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname in (
      'list_managed_department_ids',
      'conversation_visible_to_caller',
      'can_read_conversation'
    )
    order by n.nspname, p.proname
  `);

  const policies = await c.query(`
    select tablename, policyname, qual
    from pg_policies
    where schemaname = 'public'
      and tablename in ('conversations', 'conversation_messages', 'conversation_participants')
      and policyname like '%select%'
    order by tablename, policyname
  `);

  const audit369 = await c.query(`
    select 1 from supabase_migrations.schema_migrations where version = '369'
  `);

  const deptNullCount = await c.query(`
    select
      count(*)::int as total_email,
      count(*) filter (where department_id is null)::int as null_dept
    from public.conversations
    where channel_type = 'email' and deleted_at is null
  `);

  console.log(
    JSON.stringify(
      {
        helpers: helpers.rows,
        policies: policies.rows.map((r) => ({
          table: r.tablename,
          policy: r.policyname,
          usesVisibleHelper: String(r.qual ?? "").includes("conversation_visible_to_caller"),
        })),
        migration369Present: (audit369.rowCount ?? 0) > 0,
        historicalEmailDepartmentIds: deptNullCount.rows[0],
      },
      null,
      2,
    ),
  );
} finally {
  await c.end();
}
