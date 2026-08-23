import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const COMPANY_ID = "7f017b82-20ab-4fb1-84ca-f686e1d026b8";
const HIST_AT = "2026-08-19T14:19:46.932Z";
const merged = loadProjectEnv(resolveProjectRoot(import.meta.url));
const c = new pg.Client({ connectionString: merged.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = (sql, params = []) => c.query(sql, params);

const newer = await q(
  `select id, company_id, event_type, occurred_at, new_value
   from public.billing_audit_logs
   where event_type in ('package_upgraded','package_downgraded','package_changed')
     and occurred_at > $1::timestamptz
   order by occurred_at`,
  [HIST_AT],
);
console.log("NEWER_PACKAGE_EVENTS", newer.rowCount, newer.rows.map((r) => ({
  id: r.id,
  company_id: r.company_id,
  occurred_at: r.occurred_at,
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
  `select feature_code, source
   from public.company_feature_overrides
   where company_id=$1 and is_active = true and override_state='enabled'
   order by source, feature_code`,
  [COMPANY_ID],
)).rows;
const inactiveCustom = (await q(
  `select distinct feature_code, bool_or(is_active) as any_active
   from public.company_feature_overrides
   where company_id=$1 and feature_code in ('ai_employee','whatsapp_channel')
   group by feature_code`,
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
const intents = (await q(
  `select count(*)::int as n from public.payment_intents where company_id=$1`,
  [COMPANY_ID],
)).rows[0].n;
const plans = (await q(`select count(*)::int as n from public.plans`)).rows[0].n;
const histStill = (await q(
  `select id, occurred_at, new_value->'preserved_non_package_features' as preserved, new_value->>'reason' as reason
   from public.billing_audit_logs where id='8ccb2a75-6043-4312-999d-83b5b8931cd0'`,
)).rows[0];

console.log("HISTORICAL_STILL", histStill);
console.log("BUSINESS", { terms, subId: sub.id, plan, grants, inactiveCustom, limits, usageActive, checkout, intents, plans });
await c.end();
