import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const COMPANY_ID = "7f017b82-20ab-4fb1-84ca-f686e1d026b8";
const merged = loadProjectEnv(resolveProjectRoot(import.meta.url));
const c = new pg.Client({ connectionString: merged.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = (sql, params = []) => c.query(sql, params);

const mig = await q(`select version, name from supabase_migrations.schema_migrations where version in ('311','312') order by version`);
console.log("MIGRATIONS", mig.rows);

const def = (await q(
  `select pg_get_functiondef(p.oid) as def
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='change_company_package_v1'`,
)).rows[0]?.def ?? "";
const overlayAt = def.indexOf("_reset_company_custom_commercial_overlay");
const recalcAt = def.indexOf("array_agg");
const updateAt = def.indexOf("update public.billing_audit_logs");
const insertCount = (def.match(/insert into public.billing_audit_logs/gi) || []).length;
console.log("LIVE_FN", {
  overlayAt,
  recalcAt,
  updateAt,
  overlayBeforeRecalc: overlayAt >= 0 && recalcAt > overlayAt,
  overlayBeforeAuditPatch: overlayAt >= 0 && updateAt > overlayAt,
  secondInsertInWrapper: insertCount,
  hasManualContractSystem: /'manual',\s*'contract',\s*'system'/.test(def) || /source in \('manual', 'contract', 'system'\)/.test(def),
  skippedGuard: def.includes("skipped"),
});

const hist = await q(
  `select id, event_type, occurred_at, new_value, metadata
   from public.billing_audit_logs
   where company_id = $1
     and event_type in ('package_upgraded','package_downgraded','package_changed')
   order by occurred_at asc`,
  [COMPANY_ID],
);
console.log("PACKAGE_AUDIT_COUNT", hist.rowCount);
for (const row of hist.rows) {
  const preserved = row.new_value?.preserved_non_package_features ?? [];
  console.log("AUDIT_ROW", {
    id: row.id,
    event_type: row.event_type,
    occurred_at: row.occurred_at,
    reason: row.new_value?.reason,
    plan_id: row.new_value?.plan_id,
    previous_plan_id: row.previous_value?.plan_id ?? row.new_value?.previous_plan_id,
    preserved,
    hasAiEmployee: preserved.includes("ai_employee"),
    hasWhatsapp: preserved.includes("whatsapp_channel"),
    hasApiAccess: preserved.includes("api_access"),
  });
}

const applied312 = (await q(
  `select occurred_at from supabase_migrations.schema_migrations where version='312'`,
)).rows[0];
let appliedAt = null;
try {
  const cols = await q(`select column_name from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations'`);
  console.log("SCHEMA_MIGRATIONS_COLS", cols.rows.map((r) => r.column_name));
} catch { /* ignore */ }

const after312 = await q(
  `select id, event_type, occurred_at, new_value
   from public.billing_audit_logs
   where event_type in ('package_upgraded','package_downgraded','package_changed')
     and occurred_at >= timestamptz '2026-08-19 14:36:00+00'
   order by occurred_at asc`,
);
console.log("EVENTS_AFTER_312_WINDOW", after312.rowCount, after312.rows.map((r) => ({
  id: r.id,
  occurred_at: r.occurred_at,
  company: r.new_value?.company_id,
  preserved: r.new_value?.preserved_non_package_features,
})));

const terms = (await q(
  `select pricing_source, custom_package_name, custom_price_monthly, custom_price_yearly, custom_granted_feature_codes
   from public.company_commercial_terms where company_id=$1`,
  [COMPANY_ID],
)).rows[0];
const sub = (await q(
  `select id, plan_id, status, billing_cycle from public.company_subscriptions where company_id=$1`,
  [COMPANY_ID],
)).rows[0];
const plan = (await q(`select code from public.plans where id=$1`, [sub.plan_id])).rows[0];
const grants = (await q(
  `select feature_code, source, is_active, override_state
   from public.company_feature_overrides
   where company_id=$1 and is_active = true and override_state='enabled'
   order by source, feature_code`,
  [COMPANY_ID],
)).rows;
const inactiveCustom = (await q(
  `select feature_code, source, is_active
   from public.company_feature_overrides
   where company_id=$1 and feature_code in ('ai_employee','whatsapp_channel')
   order by feature_code, is_active desc`,
  [COMPANY_ID],
)).rows;
const limits = (await q(
  `select max_users, max_branches, source from public.company_resource_limits where company_id=$1`,
  [COMPANY_ID],
)).rows[0];
const usageActive = (await q(
  `select count(*)::int as n from public.company_usage_limit_overrides where company_id=$1 and is_active=true`,
  [COMPANY_ID],
)).rows[0].n;
const checkout = (await q(
  `select count(*)::int as n from public.billing_checkout_sessions where company_id=$1`,
  [COMPANY_ID],
)).rows[0].n;
const plans = (await q(`select count(*)::int as n from public.plans`)).rows[0].n;
const subs = (await q(`select count(*)::int as n from public.company_subscriptions`)).rows[0].n;

console.log("BUSINESS_STATE", { terms, sub, plan, grants, inactiveCustom, limits, usageActive, checkout, plans, subs });
await c.end();
