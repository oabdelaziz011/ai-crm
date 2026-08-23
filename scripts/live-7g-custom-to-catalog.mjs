import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const COMPANY_ID = "7f017b82-20ab-4fb1-84ca-f686e1d026b8";
const merged = loadProjectEnv(resolveProjectRoot(import.meta.url));
if (!merged.DATABASE_URL?.trim()) throw new Error("DATABASE_URL missing");
const c = new pg.Client({ connectionString: merged.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = (sql, params = []) => c.query(sql, params);

async function snapshot(label) {
  const company = (await q(`select id, name, status, approval_status from public.companies where id=$1`, [COMPANY_ID])).rows[0];
  const sub = (await q(`select * from public.company_subscriptions where company_id=$1`, [COMPANY_ID])).rows[0];
  const plan = sub?.plan_id
    ? (await q(`select id, code, name, display_name, is_active, price_monthly, price_yearly, tier_rank from public.plans where id=$1`, [sub.plan_id])).rows[0]
    : null;
  const terms = (await q(`select * from public.company_commercial_terms where company_id=$1`, [COMPANY_ID])).rows[0] || null;
  const grants = (await q(
    `select feature_code, source, override_state, is_active, starts_at, expires_at, notes, reason
     from public.company_feature_overrides
     where company_id=$1
     order by is_active desc, source, feature_code`,
    [COMPANY_ID],
  )).rows;
  const limits = (await q(`select * from public.company_resource_limits where company_id=$1`, [COMPANY_ID])).rows[0] || null;
  const usage = (await q(
    `select metric_code, included_quantity, is_unlimited, is_active, notes
     from public.company_usage_limit_overrides where company_id=$1
     order by is_active desc, metric_code`,
    [COMPANY_ID],
  )).rows;
  let occupancy = null;
  try {
    occupancy = (await q(`select public.get_company_resource_occupancy_v1($1) as j`, [COMPANY_ID])).rows[0]?.j;
  } catch (error) {
    occupancy = { error: error.message };
  }
  const users = (await q(
    `select count(*)::int as n from public.profiles where company_id=$1`,
    [COMPANY_ID],
  )).rows[0].n;
  const activeUsers = (await q(
    `select count(*)::int as n from public.profiles where company_id=$1 and coalesce(is_active,true)=true`,
    [COMPANY_ID],
  )).rows[0].n;
  let branches = { total: null, error: null };
  try {
    branches = {
      total: (await q(`select count(*)::int as n from public.company_branches where company_id=$1`, [COMPANY_ID])).rows[0].n,
    };
  } catch (error) {
    try {
      branches = {
        total: (await q(`select count(*)::int as n from public.branches where company_id=$1`, [COMPANY_ID])).rows[0].n,
      };
    } catch (error2) {
      branches = { error: error2.message };
    }
  }
  const audit = (await q(
    `select event_type, previous_value, new_value, source, metadata, occurred_at
     from public.billing_audit_logs
     where company_id=$1
     order by occurred_at desc
     limit 8`,
    [COMPANY_ID],
  )).rows;
  const counts = {
    plans: (await q(`select count(*)::int as n from public.plans`)).rows[0].n,
    subscriptions: (await q(`select count(*)::int as n from public.company_subscriptions`)).rows[0].n,
    otherCustom: (await q(
      `select count(*)::int as n from public.company_commercial_terms
       where pricing_source='custom' and company_id <> $1`,
      [COMPANY_ID],
    )).rows[0].n,
  };
  const grouped = { package: [], manual: [], contract: [], system: [], trial: [], other: [] };
  for (const g of grants.filter((r) => r.is_active && r.override_state === "enabled")) {
    const key = grouped[g.source] ? g.source : "other";
    grouped[key].push(g.feature_code);
  }
  const snap = { label, company, sub, plan, terms, grants, grouped, limits, usage, occupancy, users, activeUsers, branches, audit, counts };
  console.log(`\n========== ${label} ==========`);
  console.log(JSON.stringify({
    company,
    subscription: sub && {
      id: sub.id,
      plan_id: sub.plan_id,
      status: sub.status,
      billing_cycle: sub.billing_cycle,
      current_period_start: sub.current_period_start,
      current_period_end: sub.current_period_end,
      trial_ends_at: sub.trial_ends_at,
      package_assigned_at: sub.package_assigned_at,
      package_feature_snapshot: sub.package_feature_snapshot,
    },
    plan,
    terms: terms && {
      pricing_source: terms.pricing_source,
      custom_package_name: terms.custom_package_name,
      custom_granted_feature_codes: terms.custom_granted_feature_codes,
      custom_price_monthly: terms.custom_price_monthly,
      custom_price_yearly: terms.custom_price_yearly,
      discount_percent: terms.discount_percent,
      notes: terms.notes,
    },
    grouped,
    activeGrants: grants.filter((g) => g.is_active),
    limits,
    activeUsage: usage.filter((u) => u.is_active),
    occupancy,
    users,
    activeUsers,
    branches,
    latestAudit: audit.slice(0, 3).map((a) => ({ event_type: a.event_type, occurred_at: a.occurred_at })),
    counts,
  }, null, 2));
  return snap;
}

try {
  const pre = await snapshot("PRE");
  const basic = (await q(
    `select id, code, name, display_name, is_active, price_monthly, price_yearly
     from public.plans
     where is_active = true and (lower(code) in ('basic','starter') or lower(code) like 'basic%')
     order by code
     limit 1`,
  )).rows[0];
  console.log("\nTARGET_BASIC", JSON.stringify(basic));
  if (!basic) throw new Error("No active Basic catalog plan");
  if (pre.terms?.pricing_source !== "custom") {
    console.log("BLOCKED: company is not currently custom overlay");
    process.exitCode = 2;
  } else {
    console.log("\nEXECUTING public.change_company_package_v1 ...");
    let rpcOk = false;
    try {
      const result = await q(
        `select public.change_company_package_v1($1::uuid, $2::uuid, $3::text) as j`,
        [COMPANY_ID, basic.id, "Task 7G catalog reset verification"],
      );
      console.log("RPC_RESULT", JSON.stringify(result.rows[0]?.j, null, 2));
      rpcOk = true;
    } catch (error) {
      console.log("RPC_REJECTED", error.message);
      process.exitCode = 3;
    }
    if (!rpcOk) {
      await c.end();
      process.exit(process.exitCode || 3);
    }
    const post = await snapshot("POST");
    const sameSub = pre.sub?.id === post.sub?.id;
    const planNowBasic = post.sub?.plan_id === basic.id;
    const overlayGone = post.terms?.pricing_source !== "custom"
      && !post.terms?.custom_package_name
      && !post.terms?.custom_price_monthly
      && !post.terms?.custom_granted_feature_codes;
    const manualApi = post.grants.some((g) => g.feature_code === "api_access" && g.source === "manual" && g.is_active && g.override_state === "enabled");
    const customContractRemaining = (pre.terms?.custom_granted_feature_codes || []).filter((code) =>
      post.grants.some((g) => g.feature_code === code && g.source === "contract" && g.is_active && g.override_state === "enabled"),
    );
    const usageStillActive = post.usage.filter((u) => u.is_active).map((u) => u.metric_code);
    console.log("\n========== CHECKS ==========");
    console.log("same_subscription_row", sameSub);
    console.log("plan_is_basic", planNowBasic, post.plan?.code);
    console.log("status_unchanged", pre.sub?.status === post.sub?.status, post.sub?.status);
    console.log("cycle_preserved", pre.sub?.billing_cycle === post.sub?.billing_cycle, post.sub?.billing_cycle);
    console.log("overlay_cleared", overlayGone, post.terms?.pricing_source);
    console.log("manual_api_access_preserved", manualApi);
    console.log("custom_contract_grants_still_active", customContractRemaining);
    console.log("active_usage_overrides", usageStillActive);
    console.log("resource_limits", post.limits);
    console.log("users_count_unchanged", pre.users === post.users, pre.users, post.users);
    console.log("plans_count_unchanged", pre.counts.plans === post.counts.plans);
    console.log("subscriptions_count_unchanged", pre.counts.subscriptions === post.counts.subscriptions);
    console.log("other_custom_unchanged", pre.counts.otherCustom === post.counts.otherCustom);
  }
} finally {
  await c.end();
}
