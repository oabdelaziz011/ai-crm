/**
 * Apply + verify migration 372 (Phase 6D Step 4 visibility permission packing).
 * Run: node scripts/apply-and-verify-372-visibility-permission-packing.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";

const root = resolve("D:/ValueOR/project");
const env = loadProjectEnv(root, { hydrateProcessEnv: true, mergeProcessEnv: true });
if (!env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL missing");

const version = "372";
const migrationName = "372_phase6d_conversation_visibility_permission_packing.sql";
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
    console.log("APPLIED_372");
  } else {
    console.log("372_IDEMPOTENT_REAPPLY");
  }

  const templates = await c.query(`
    select template_key, permission_code
    from public.platform_role_template_permissions
    where permission_code in ('ai.conversations.view', 'ai.conversations.view_assigned')
      and template_key in ('admin', 'manager', 'human_handoff_agent', 'employee')
    order by template_key, permission_code
  `);
  console.log("TEMPLATE_PACK", JSON.stringify(templates.rows));

  const defaults = await c.query(`
    select r.template_key, p.code as permission_code, count(*)::int as role_count
    from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where r.role_type = 'DEFAULT'
      and r.template_key in ('admin', 'manager', 'human_handoff_agent')
      and p.code in ('ai.conversations.view', 'ai.conversations.view_assigned')
    group by r.template_key, p.code
    order by r.template_key, p.code
  `);
  console.log("DEFAULT_ROLE_PACK", JSON.stringify(defaults.rows));

  const customView = await c.query(`
    select count(*)::int as custom_with_view
    from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where r.role_type = 'CUSTOM'
      and p.code = 'ai.conversations.view'
  `);
  console.log("CUSTOM_WITH_VIEW_COUNT", customView.rows[0].custom_with_view);

  const directUser = await c.query(`
    select count(*)::int as direct_view_grants
    from public.user_permissions up
    join public.permissions p on p.id = up.permission_id
    where p.code in ('ai.conversations.view', 'ai.conversations.view_assigned')
  `);
  console.log("DIRECT_USER_VIEW_GRANTS", directUser.rows[0].direct_view_grants);

  const hhaStillHasView = await c.query(`
    select count(*)::int as bad
    from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where r.role_type = 'DEFAULT'
      and r.template_key = 'human_handoff_agent'
      and p.code = 'ai.conversations.view'
  `);
  if (hhaStillHasView.rows[0].bad > 0) {
    throw new Error("DEFAULT human_handoff_agent still has ai.conversations.view");
  }

  const adminLostView = await c.query(`
    select count(*)::int as ok
    from public.platform_role_template_permissions
    where template_key = 'admin'
      and permission_code = 'ai.conversations.view'
  `);
  if (adminLostView.rows[0].ok !== 1) {
    throw new Error("admin template lost ai.conversations.view");
  }

  console.log("VERIFY_372_OK");
} finally {
  await c.end();
}
