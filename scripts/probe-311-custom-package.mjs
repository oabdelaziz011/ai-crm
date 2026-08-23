import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const merged = loadProjectEnv(root);
const connectionString = merged.DATABASE_URL;
if (!connectionString?.trim()) throw new Error("DATABASE_URL missing");

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const q = async (label, sql, params = []) => {
    try {
      const res = await client.query(sql, params);
      console.log(`\n=== ${label} ===`);
      console.log(JSON.stringify(res.rows, null, 2).slice(0, 4000));
    } catch (error) {
      console.log(`\n=== ${label} ERROR ===`);
      console.log(error instanceof Error ? error.message : String(error));
    }
  };

  await q(
    "schema_migrations_311",
    `select version, name from supabase_migrations.schema_migrations
     where version in ('311','312') or name ilike '%custom_package%' or name ilike '%311%'
     order by version`,
  );
  await q(
    "terms_columns",
    `select column_name, data_type from information_schema.columns
     where table_schema='public' and table_name='company_commercial_terms'
     order by ordinal_position`,
  );
  await q(
    "rpc_exists",
    `select p.proname, pg_get_function_identity_arguments(p.oid) as args
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname in ('public','internal')
       and p.proname in (
         'configure_company_custom_package_v1',
         '_reset_company_custom_commercial_overlay',
         'change_company_package_v1',
         'convert_trial_to_paid_v1',
         '_set_company_feature_grant_internal',
         '_upsert_company_resource_limits',
         '_apply_company_resource_limits_from_plan',
         '_package_feature_codes',
         'write_billing_audit_log',
         'is_super_admin'
       )
     order by n.nspname, p.proname`,
  );
  await q(
    "audit_type",
    `select code, is_active from public.billing_audit_event_types
     where code = 'company_custom_package_configured'`,
  );
  await q(
    "feature_codes",
    `select code, is_billable, requires_subscription, is_active
     from public.feature_definitions
     where code in (
       'leads','opportunities','bookings','operations','ticketing',
       'ai_employee','ai_assistant','ai_email_routing','ai_ticketing','ai_suggested_replies',
       'whatsapp_channel','facebook_channel','instagram_channel','email_channel','sms_channel','omnichannel',
       'workflow_automation','basic_reports','advanced_reports','api_access'
     )
     order by code`,
  );
  await q(
    "metric_codes",
    `select code, aggregation_type, billable, is_active
     from public.usage_metric_definitions
     where code in (
       'ai_email_routing','ai_employee_email','api_calls','whatsapp_messages','ai_tokens',
       'emails_sent','sms_sent','storage_bytes','users'
     )
     order by code`,
  );
  await q(
    "test_company",
    `select c.id, c.name, s.status, s.plan_id, s.billing_cycle, p.code as plan_code
     from public.companies c
     left join public.company_subscriptions s on s.company_id = c.id
     left join public.plans p on p.id = s.plan_id
     where c.name ilike '%عمر%' or c.name ilike '%test%' or c.name ilike '%اختبار%'
     order by c.created_at desc
     limit 15`,
  );
} finally {
  await client.end();
}
