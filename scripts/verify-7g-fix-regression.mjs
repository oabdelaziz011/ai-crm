import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const COMPANY_ID = "7f017b82-20ab-4fb1-84ca-f686e1d026b8";
const merged = loadProjectEnv(resolveProjectRoot(import.meta.url));
const c = new pg.Client({ connectionString: merged.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const def = (await c.query(
  `select pg_get_functiondef(p.oid) as def
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='change_company_package_v1'`,
)).rows[0].def;
const overlayAt = def.indexOf("_reset_company_custom_commercial_overlay");
const preservedAt = def.indexOf("preserved_non_package_features");
console.log("overlay_before_preserved_recalc", overlayAt >= 0 && preservedAt > overlayAt, overlayAt, preservedAt);
const terms = (await c.query(`select pricing_source, custom_package_name, custom_price_monthly, custom_granted_feature_codes from public.company_commercial_terms where company_id=$1`, [COMPANY_ID])).rows[0];
const sub = (await c.query(`select plan_id, status from public.company_subscriptions where company_id=$1`, [COMPANY_ID])).rows[0];
const plan = (await c.query(`select code from public.plans where id=$1`, [sub.plan_id])).rows[0];
const grants = (await c.query(
  `select feature_code, source, is_active from public.company_feature_overrides
   where company_id=$1 and is_active and override_state='enabled' order by source, feature_code`,
  [COMPANY_ID],
)).rows;
const limits = (await c.query(`select max_users, max_branches, source from public.company_resource_limits where company_id=$1`, [COMPANY_ID])).rows[0];
const usage = (await c.query(`select count(*)::int as n from public.company_usage_limit_overrides where company_id=$1 and is_active`, [COMPANY_ID])).rows[0].n;
const checkout = (await c.query(`select count(*)::int as n from public.billing_checkout_sessions where company_id=$1`, [COMPANY_ID])).rows[0].n;
const plans = (await c.query(`select count(*)::int as n from public.plans`)).rows[0].n;
console.log({ terms, plan, grants, limits, usageActive: usage, checkout, plans });
await c.end();
