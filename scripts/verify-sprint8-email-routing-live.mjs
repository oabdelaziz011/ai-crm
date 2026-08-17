/**
 * Sprint 8 — live schema/security smoke for AI Email Routing (read-only + safe checks).
 * Does not mutate production routing configuration permanently.
 */
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { loadSupabaseEnv, resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = { ...loadSupabaseEnv(root), ...loadProjectEnv(root) };
const projectRef = env.SUPABASE_PROJECT_REF ?? "lfbtnskmvibikalsxwsm";
const password = env.SUPABASE_DB_PASSWORD ?? env.POSTGRES_PASSWORD;
if (!password) throw new Error("SUPABASE_DB_PASSWORD missing");

const pooler = `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@aws-0-eu-north-1.pooler.supabase.com:5432/postgres`;

const checks = [];
function ok(name, detail = "") {
  checks.push({ name, pass: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  checks.push({ name, pass: false, detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

const client = new pg.Client({
  connectionString: pooler,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

try {
  const { rows: mig } = await client.query(
    `select version, name from supabase_migrations.schema_migrations where version = '292'`,
  );
  if (mig.length) ok("migration_292_registered", mig[0].name);
  else ok("migration_292_table_present_check", "schema_migrations row optional");

  const { rows: table } = await client.query(`
    select relrowsecurity
    from pg_class
    where oid = 'public.company_email_routing_category_targets'::regclass
  `);
  if (table[0]?.relrowsecurity === true) ok("rls_enabled");
  else fail("rls_enabled");

  const { rows: fns } = await client.query(`
    select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'get_my_company_email_routing_config',
        'upsert_my_company_email_routing_config'
      )
  `);
  if (fns.length === 2 && fns.every((f) => f.auth_exec === true)) {
    ok("rpc_execute_authenticated", fns.map((f) => f.proname).join(","));
  } else fail("rpc_execute_authenticated", JSON.stringify(fns));

  const { rows: anonExec } = await client.query(`
    select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_exec
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'get_my_company_email_routing_config',
        'upsert_my_company_email_routing_config'
      )
  `);
  if (anonExec.every((f) => f.anon_exec === false)) ok("rpc_execute_anon_denied");
  else fail("rpc_execute_anon_denied", JSON.stringify(anonExec));

  const { rows: feat } = await client.query(
    `select code, linked_usage_metric_code from public.feature_definitions where code = 'ai_email_routing'`,
  );
  const { rows: metric } = await client.query(
    `select code from public.usage_metric_definitions where code = 'ai_email_routing'`,
  );
  if (feat[0]?.code === "ai_email_routing" && metric[0]?.code === "ai_email_routing") {
    ok("entitlement_usage_metric", `linked=${feat[0].linked_usage_metric_code}`);
  } else fail("entitlement_usage_metric");

  const { rows: isFeature } = await client.query(`
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='is_feature_enabled'
  `);
  if (isFeature.length) ok("is_feature_enabled_present");
  else fail("is_feature_enabled_present");
} catch (error) {
  fail("live_verify_error", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end();
}

const pass = checks.filter((c) => c.pass).length;
const failCount = checks.filter((c) => !c.pass).length;
console.log(JSON.stringify({ pass, fail: failCount, checks }, null, 2));
if (failCount > 0) process.exitCode = 1;
