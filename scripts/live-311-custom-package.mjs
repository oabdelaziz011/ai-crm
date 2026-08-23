import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const merged = loadProjectEnv(resolveProjectRoot(import.meta.url));
if (!merged.DATABASE_URL?.trim()) throw new Error("DATABASE_URL missing");

const results = [];
const ok = (name, detail = "") => {
  results.push({ name, pass: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
};
const fail = (name, detail = "") => {
  results.push({ name, pass: false, detail });
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
};

const client = new pg.Client({ connectionString: merged.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = (sql, params = []) => client.query(sql, params);
const companyRow = (await q(`select id from public.companies where name = 'شركة عمر' limit 1`)).rows[0];
const trialRow = (
  await q(
    `select c.id from public.companies c join public.company_subscriptions s on s.company_id=c.id where s.status='trialing' limit 1`,
  )
).rows[0];
const COMPANY_ID = companyRow?.id;
const TRIAL_COMPANY_ID = trialRow?.id;
if (!COMPANY_ID) throw new Error("test company شركة عمر not found");
console.log("company", COMPANY_ID, "trial", TRIAL_COMPANY_ID);

try {
  const cols = await q(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='company_commercial_terms'
       and column_name in ('custom_package_name','custom_granted_feature_codes')`,
  );
  if (cols.rowCount === 2) ok("schema_columns");
  else fail("schema_columns", JSON.stringify(cols.rows));

  const rpc = await q(
    `select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='configure_company_custom_package_v1'`,
  );
  if (rpc.rowCount >= 1) ok("rpc_exists");
  else fail("rpc_exists");

  const auditType = await q(
    `select 1 from public.billing_audit_event_types where code='company_custom_package_configured' and is_active=true`,
  );
  if (auditType.rowCount === 1) ok("audit_type");
  else fail("audit_type");

  const wrap = await q(
    `select pg_get_functiondef(p.oid) as def
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='change_company_package_v1' limit 1`,
  );
  if (String(wrap.rows[0]?.def || "").includes("_reset_company_custom_commercial_overlay")) ok("catalog_wrap");
  else fail("catalog_wrap");

  const occ = await q(`select public.get_company_resource_occupancy_v1($1) as j`, [COMPANY_ID]);
  const occupancy = occ.rows[0]?.j ?? {};
  const usersUsed = Number(occupancy?.users?.current_count ?? 0);
  const branchesUsed = Number(occupancy?.branches?.current_count ?? 0);
  const maxUsers = usersUsed > 1 ? usersUsed - 1 : 5;
  console.log("occupancy", JSON.stringify({ usersUsed, branchesUsed, maxUsers, occupancy }));

  const beforePlans = (await q(`select count(*)::int as n from public.plans`)).rows[0].n;
  const usersBefore = (
    await q(
      `select count(*)::int as n from public.profiles where company_id=$1 and coalesce(is_active,true)=true`,
      [COMPANY_ID],
    )
  ).rows[0].n;

  await q(
    `select public._set_company_feature_grant_internal(
       $1::uuid, 'api_access', true, 'manual', now(), null, '7F preserve fixture', 'manual preservation'
     )`,
    [COMPANY_ID],
  );
  const manualSeed = await q(
    `select count(*)::int as n from public.company_feature_overrides
     where company_id=$1 and feature_code='api_access' and source='manual' and is_active=true
       and override_state='enabled'`,
    [COMPANY_ID],
  );
  if (manualSeed.rows[0].n >= 1) ok("seed_manual_grant");
  else fail("seed_manual_grant");

  const usagePayload = [
    { metric_code: "ai_email_routing", included_quantity: 100, is_unlimited: false },
    { metric_code: "ai_employee_email", included_quantity: 50, is_unlimited: false },
    { metric_code: "api_calls", included_quantity: 1000, is_unlimited: false },
    { metric_code: "whatsapp_messages", included_quantity: 500, is_unlimited: false },
    { metric_code: "ai_tokens", included_quantity: 10000, is_unlimited: false },
    { metric_code: "emails_sent", included_quantity: 100, is_unlimited: false },
    { metric_code: "sms_sent", included_quantity: null, is_unlimited: true },
    { metric_code: "storage_bytes", included_quantity: null, is_unlimited: false },
  ];

  const save = await q(
    `select public.configure_company_custom_package_v1(
       $1::uuid, $2::text, 'monthly', 100, 1000, $3::text, $4::text[], $5::int, 2, $6::jsonb
     ) as j`,
    [
      COMPANY_ID,
      "باقة اختبار مخصصة",
      "7F live custom save",
      ["ticketing", "ai_employee", "whatsapp_channel"],
      maxUsers,
      JSON.stringify(usagePayload),
    ],
  );
  const saved = save.rows[0]?.j;
  if (saved?.ok === true && saved?.payment_collected === false) ok("custom_save");
  else fail("custom_save", JSON.stringify(saved));

  const terms = (await q(`select * from public.company_commercial_terms where company_id=$1`, [COMPANY_ID])).rows[0];
  if (
    terms?.custom_package_name === "باقة اختبار مخصصة" &&
    terms?.pricing_source === "custom" &&
    Number(terms.custom_price_monthly) === 100 &&
    Number(terms.custom_price_yearly) === 1000
  ) {
    ok("terms_persisted");
  } else fail("terms_persisted", JSON.stringify(terms));

  const sub = (await q(`select billing_cycle, status from public.company_subscriptions where company_id=$1`, [COMPANY_ID])).rows[0];
  if (sub?.billing_cycle === "monthly") ok("billing_cycle");
  else fail("billing_cycle", JSON.stringify(sub));

  const grants = (
    await q(
      `select feature_code, source, override_state, is_active
       from public.company_feature_overrides
       where company_id=$1 and is_active=true and override_state='enabled'`,
      [COMPANY_ID],
    )
  ).rows;
  const enabled = (code, source) => grants.some((g) => g.feature_code === code && g.source === source);
  if (enabled("ticketing", "contract") && enabled("ai_employee", "contract") && enabled("whatsapp_channel", "contract")) {
    ok("selected_features");
  } else fail("selected_features", JSON.stringify(grants));
  if (!enabled("opportunities", "contract") && !enabled("leads", "contract")) ok("unselected_not_custom");
  else fail("unselected_not_custom", JSON.stringify(grants.filter((g) => ["opportunities", "leads"].includes(g.feature_code))));
  if (enabled("api_access", "manual")) ok("manual_preserved");
  else fail("manual_preserved", JSON.stringify(grants.filter((g) => g.feature_code === "api_access")));

  const lim = (await q(`select * from public.company_resource_limits where company_id=$1`, [COMPANY_ID])).rows[0];
  if (lim && Number(lim.max_users) === maxUsers && Number(lim.max_branches) === 2 && lim.source === "contract") {
    ok("resource_limits", JSON.stringify({ max_users: lim.max_users, max_branches: lim.max_branches, usersUsed }));
  } else fail("resource_limits", JSON.stringify(lim));

  const usage = (
    await q(
      `select metric_code, included_quantity, is_unlimited
       from public.company_usage_limit_overrides
       where company_id=$1 and is_active=true`,
      [COMPANY_ID],
    )
  ).rows;
  const umap = Object.fromEntries(usage.map((r) => [r.metric_code, r]));
  const qty = (code, n) => Number(umap[code]?.included_quantity) === n && umap[code]?.is_unlimited === false;
  if (
    qty("ai_email_routing", 100) &&
    qty("ai_employee_email", 50) &&
    qty("api_calls", 1000) &&
    qty("whatsapp_messages", 500) &&
    qty("ai_tokens", 10000) &&
    qty("emails_sent", 100) &&
    umap.sms_sent?.is_unlimited === true
  ) {
    ok("usage_quotas", usage.map((r) => `${r.metric_code}:${r.is_unlimited ? "unl" : r.included_quantity}`).join(","));
  } else fail("usage_quotas", JSON.stringify(usage));
  if (!umap.storage_bytes || umap.storage_bytes.is_unlimited === false) ok("storage_gauge_not_unlimited_counter");
  else fail("storage_gauge_not_unlimited_counter");

  const audit = (
    await q(
      `select event_type, new_value from public.billing_audit_logs
       where company_id=$1 and event_type='company_custom_package_configured'
       order by occurred_at desc limit 1`,
      [COMPANY_ID],
    )
  ).rows[0];
  if (audit && String(JSON.stringify(audit.new_value)).includes("باقة اختبار مخصصة")) ok("audit");
  else fail("audit", JSON.stringify(audit || null));

  const afterPlans = (await q(`select count(*)::int as n from public.plans`)).rows[0].n;
  if (afterPlans === beforePlans) ok("no_new_plan");
  else fail("no_new_plan", `${beforePlans}->${afterPlans}`);
  if (saved?.payment_collected === false) ok("no_payment");
  else fail("no_payment", JSON.stringify(saved));

  try {
    await q(
      `select public.configure_company_custom_package_v1(
         $1::uuid, 'should-not-stick', 'monthly', 1, 1, 'fail', ARRAY['not_a_real_feature']::text[], 1, 1, '[]'::jsonb
       )`,
      [COMPANY_ID],
    );
    fail("invalid_feature_throws");
  } catch (error) {
    ok("invalid_feature_throws", String(error.message).slice(0, 160));
  }
  const nameAfterFail = (await q(`select custom_package_name from public.company_commercial_terms where company_id=$1`, [COMPANY_ID])).rows[0]
    ?.custom_package_name;
  if (nameAfterFail === "باقة اختبار مخصصة") ok("failed_tx_no_partial");
  else fail("failed_tx_no_partial", String(nameAfterFail));

  const usersAfter = (
    await q(
      `select count(*)::int as n from public.profiles where company_id=$1 and coalesce(is_active,true)=true`,
      [COMPANY_ID],
    )
  ).rows[0].n;
  if (usersAfter === usersBefore) ok("users_not_deleted", `n=${usersAfter} max=${maxUsers} used=${usersUsed}`);
  else fail("users_not_deleted", `${usersBefore}->${usersAfter}`);

  const occAfter = (await q(`select public.get_company_resource_occupancy_v1($1) as j`, [COMPANY_ID])).rows[0].j;
  if (usersUsed > maxUsers && occAfter?.users?.is_over_limit === true) ok("over_limit_flag", JSON.stringify(occAfter.users));
  else if (usersUsed <= maxUsers) ok("over_limit_skipped_usage_not_above_cap", JSON.stringify({ usersUsed, maxUsers }));
  else fail("over_limit_flag", JSON.stringify(occAfter?.users));

  try {
    await q(
      `select public.configure_company_custom_package_v1(
         $1::uuid, 'trial-bypass', 'monthly', 1, 1, 'no', ARRAY['ticketing']::text[], 1, 1, '[]'::jsonb
       )`,
      [TRIAL_COMPANY_ID],
    );
    fail("trial_blocked");
  } catch (error) {
    const msg = String(error.message);
    if (/trialing|convert_trial_to_paid/i.test(msg)) ok("trial_blocked", msg.slice(0, 140));
    else fail("trial_blocked", msg.slice(0, 200));
  }

  const convert = await q(
    `select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='convert_trial_to_paid_v1'`,
  );
  if (convert.rowCount >= 1) ok("trial_rpc_intact");
  else fail("trial_rpc_intact");
} catch (error) {
  fail("script_error", error instanceof Error ? error.message : String(error));
} finally {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nSUMMARY ${passed} passed, ${failed} failed`);
  await client.end();
  if (failed > 0) process.exitCode = 1;
}
