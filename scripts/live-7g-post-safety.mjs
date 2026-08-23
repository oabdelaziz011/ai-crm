import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const COMPANY_ID = "7f017b82-20ab-4fb1-84ca-f686e1d026b8";
const merged = loadProjectEnv(resolveProjectRoot(import.meta.url));
const c = new pg.Client({ connectionString: merged.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = (sql, params = []) => c.query(sql, params);

const inactiveCustom = await q(
  `select feature_code, source, is_active, override_state
   from public.company_feature_overrides
   where company_id=$1 and feature_code = any(array['ai_employee','whatsapp_channel','ticketing'])
   order by feature_code, source, is_active desc`,
  [COMPANY_ID],
);
console.log("custom_feature_rows", inactiveCustom.rows);

const usageAll = await q(
  `select metric_code, is_active, included_quantity, is_unlimited
   from public.company_usage_limit_overrides where company_id=$1 order by metric_code, is_active desc`,
  [COMPANY_ID],
);
console.log("usage_all", usageAll.rows);

const audit = await q(
  `select event_type, previous_value, new_value, source, metadata
   from public.billing_audit_logs
   where company_id=$1 and event_type in ('package_upgraded','package_downgraded','package_changed','company_custom_package_configured')
   order by occurred_at desc limit 1`,
  [COMPANY_ID],
);
console.log("latest_package_audit", JSON.stringify(audit.rows[0], null, 2));

for (const table of ["payments", "checkout_sessions", "billing_checkout_sessions", "payment_intents"]) {
  const exists = await q(`select to_regclass('public.${table}') as r`);
  console.log("table", table, exists.rows[0].r);
}

const basicCodes = await q(`select public._package_feature_codes('80fdeaf9-1c0e-4f42-80f4-cb88a12986d7'::uuid) as codes`);
console.log("basic_package_codes", basicCodes.rows[0]);

const other = await q(
  `select c.id, c.name, t.pricing_source, t.custom_package_name, s.plan_id, s.status
   from public.companies c
   left join public.company_commercial_terms t on t.company_id=c.id
   left join public.company_subscriptions s on s.company_id=c.id
   where c.id <> $1
   order by c.created_at desc
   limit 5`,
  [COMPANY_ID],
);
console.log("other_companies_sample", other.rows);

await c.end();
