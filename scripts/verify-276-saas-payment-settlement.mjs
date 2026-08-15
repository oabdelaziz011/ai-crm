/**
 * Part 3 — SaaS verified payment → subscription settlement.
 * Run: node scripts/verify-276-saas-payment-settlement.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root);
if (!env.DATABASE_URL?.trim()) {
  console.log("DATABASE_URL missing — skip");
  process.exit(0);
}

const migrationSql = readFileSync(
  resolve(root, "supabase/migrations/276_saas_payment_settlement.sql"),
  "utf8",
);

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log("\nPart 3 — SaaS payment settlement\n");

async function expectFail(label, fn, match) {
  await client.query(`savepoint ${label}`);
  let errMsg = "";
  try {
    await fn();
  } catch (e) {
    errMsg = e instanceof Error ? e.message : String(e);
    await client.query(`rollback to savepoint ${label}`);
    if (match) assert.match(errMsg, match, `expected ${match} in ${errMsg}`);
    return;
  }
  assert.fail(`expected failure: ${label}`);
}

async function currencyFor(companyId) {
  const r = await client.query(
    `select coalesce(
       nullif(trim(public.resolve_billing_setting_value('default_currency', $1)#>>'{}'), ''),
       nullif(trim(public.resolve_billing_setting_value('default_currency', null)#>>'{}'), '')
     ) as c`,
    [companyId],
  );
  return r.rows[0].c;
}

async function makeCompany(suffix, packId, status = "active") {
  const co = await client.query(
    `
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      'P276 '||$1||' '||gen_random_uuid()::text,
      'Active', 'Pro', $2, 'tenant',
      'approved', now(), 'completed'
    ) returning id
  `,
    [suffix, status === "trialing" ? "trialing" : "active"],
  );
  const companyId = co.rows[0].id;
  await client.query(`select public._ensure_core_system_feature_grants($1)`, [companyId]);
  if (status === "trialing") {
    const trialEnds = new Date(Date.now() + 14 * 86400000).toISOString();
    await client.query(
      `insert into public.company_subscriptions (
         company_id, plan_id, status, billing_cycle, trial_ends_at,
         current_period_start, current_period_end, auto_renewal
       ) values ($1, $2, 'trialing', 'monthly', $3, now(), $3, true)`,
      [companyId, packId, trialEnds],
    );
    await client.query(
      `select public.set_company_feature_grant($1, 'leads', true, 'trial', now(), $2::timestamptz, 'p276')`,
      [companyId, trialEnds],
    );
  } else {
    await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [
      companyId,
      packId,
    ]);
  }
  const sub = await client.query(
    `select id, current_period_end, status, plan_id from public.company_subscriptions where company_id = $1`,
    [companyId],
  );
  return { companyId, sub: sub.rows[0] };
}

async function checkoutAndVerify(companyId, key) {
  const created = await client.query(
    `select public.create_billing_checkout_session_v1(
       'https://app.example/return', null, $1, $2, 'sandbox'
     ) as r`,
    [key, companyId],
  );
  assert.equal(created.rows[0].r.ok, true, JSON.stringify(created.rows[0].r));
  const session = created.rows[0].r.session;
  const providerSession = `sandbox_cs_${session.id}`;
  await client.query(
    `select public.attach_billing_checkout_provider_v1($1, $2, $3, 'sandbox', '{}'::jsonb)`,
    [session.id, providerSession, `https://app.example/return?saas_checkout=${session.id}`],
  );
  const verified = await client.query(
    `select public.record_billing_checkout_payment_event_v1(
       'sandbox', $1, 'sandbox.payment.succeeded', 'succeeded',
       $2, $3, $4, '{}'::jsonb, $5, null, null
     ) as r`,
    [
      `evt-${key}`,
      providerSession,
      `pay-${key}`,
      session.id,
      `sandbox:evt-${key}`,
    ],
  );
  assert.equal(verified.rows[0].r.code, "PAYMENT_VERIFIED");
  return { session, providerSession, verified: verified.rows[0].r };
}

try {
  await client.query(migrationSql);
  console.log("  ✓ migration 276 applied");

  await client.query("begin");
  await client.query("select set_config('vault.provisioning_bootstrap', 'true', true)");
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");

  const pack = await client.query(`
    select public.upsert_commercial_package_v1(
      'p276_pack', 'P276 Pack', null, 'P276 Pack', 'fixed pack',
      80, 800, true, false, true, 276, 0,
      '{}'::jsonb, null, null, null, null, 'fixed'
    ) as r
  `);
  const packId = pack.rows[0].r.id;
  await client.query(`select public.set_commercial_package_features_v1($1, $2)`, [
    packId,
    ["core_crm", "customers", "leads", "bookings"],
  ]);

  // ── Normal renewal settlement
  const active = await makeCompany("active", packId, "active");
  const currency = await currencyFor(active.companyId);
  assert.ok(currency);
  const period0 = active.sub.current_period_end;

  const c1 = await checkoutAndVerify(active.companyId, `p276-active-${active.companyId}`);
  const settle1 = await client.query(
    `select public.settle_saas_verified_payment_v1($1) as r`,
    [c1.session.id],
  );
  assert.equal(settle1.rows[0].r.ok, true);
  assert.equal(settle1.rows[0].r.code, "SETTLEMENT_SUCCEEDED");
  assert.equal(settle1.rows[0].r.settlement_code, "RENEWED");
  assert.ok(settle1.rows[0].r.billing_payment_id);

  const sub1 = await client.query(
    `select status, current_period_end, grace_period_ends_at from public.company_subscriptions where company_id = $1`,
    [active.companyId],
  );
  assert.equal(sub1.rows[0].status, "active");
  assert.ok(sub1.rows[0].current_period_end > period0);
  assert.equal(sub1.rows[0].grace_period_ends_at, null);

  const pay1 = await client.query(
    `select status, amount, currency, provider_payment_id, idempotency_key
     from public.billing_payments where id = $1`,
    [settle1.rows[0].r.billing_payment_id],
  );
  assert.equal(pay1.rows[0].status, "succeeded");
  assert.equal(Number(pay1.rows[0].amount) >= 80, true);
  assert.equal(pay1.rows[0].currency, currency);

  const inv1 = await client.query(
    `select status from public.billing_invoices where billing_payment_id = $1`,
    [settle1.rows[0].r.billing_payment_id],
  );
  assert.equal(inv1.rows[0].status, "paid");
  const rcpt1 = await client.query(
    `select id from public.billing_receipts where billing_payment_id = $1`,
    [settle1.rows[0].r.billing_payment_id],
  );
  assert.equal(rcpt1.rowCount, 1);
  console.log("  ✓ normal payment settles: payment+invoice+receipt+period");

  // Idempotent settle
  const settle1b = await client.query(
    `select public.settle_saas_verified_payment_v1($1) as r`,
    [c1.session.id],
  );
  assert.equal(settle1b.rows[0].r.idempotent_replay, true);
  assert.equal(settle1b.rows[0].r.billing_payment_id, settle1.rows[0].r.billing_payment_id);
  const period1 = (
    await client.query(
      `select current_period_end from public.company_subscriptions where company_id = $1`,
      [active.companyId],
    )
  ).rows[0].current_period_end;
  assert.equal(String(period1), String(sub1.rows[0].current_period_end));
  console.log("  ✓ duplicate settlement does not extend twice");

  // ── Trial → paid
  const trial = await makeCompany("trial", packId, "trialing");
  await client.query(
    `select public.set_company_feature_grant($1, 'whatsapp_channel', true, 'manual', now(), null, 'p276-m')`,
    [trial.companyId],
  );
  const cTrial = await checkoutAndVerify(trial.companyId, `p276-trial-${trial.companyId}`);
  const settleTrial = await client.query(
    `select public.settle_saas_verified_payment_v1($1) as r`,
    [cTrial.session.id],
  );
  assert.equal(settleTrial.rows[0].r.settlement_code, "TRIAL_CONVERTED_AND_PAID");
  const subT = await client.query(
    `select status, plan_id from public.company_subscriptions where company_id = $1`,
    [trial.companyId],
  );
  assert.equal(subT.rows[0].status, "active");
  assert.equal(subT.rows[0].plan_id, packId);

  const trialGrants = await client.query(
    `select count(*)::int as n from public.company_feature_overrides
     where company_id = $1 and source = 'trial' and is_active = true`,
    [trial.companyId],
  );
  assert.equal(trialGrants.rows[0].n, 0);
  const manualOk = await client.query(
    `select public.is_feature_enabled($1, 'whatsapp_channel') as e`,
    [trial.companyId],
  );
  assert.equal(manualOk.rows[0].e, true);
  const pkgOk = await client.query(
    `select public.is_feature_enabled($1, 'leads') as e`,
    [trial.companyId],
  );
  assert.equal(pkgOk.rows[0].e, true);
  console.log("  ✓ trial→paid: active, trial grants expired, manual preserved");

  // ── past_due recovery
  const recover = await makeCompany("recover", packId, "active");
  await client.query(`select public.mark_subscription_past_due_v1($1, 'p276 test')`, [
    recover.companyId,
  ]);
  const cRec = await checkoutAndVerify(recover.companyId, `p276-rec-${recover.companyId}`);
  const settleRec = await client.query(
    `select public.settle_saas_verified_payment_v1($1) as r`,
    [cRec.session.id],
  );
  assert.equal(settleRec.rows[0].r.settlement_code, "RECOVERY_PAID");
  const subR = await client.query(
    `select status, grace_period_ends_at from public.company_subscriptions where company_id = $1`,
    [recover.companyId],
  );
  assert.equal(subR.rows[0].status, "active");
  assert.equal(subR.rows[0].grace_period_ends_at, null);
  console.log("  ✓ past_due recovery → active");

  // ── grace recovery
  const grace = await makeCompany("grace", packId, "active");
  await client.query(`select public.record_subscription_renewal_failure_v1($1, 'p276 grace')`, [
    grace.companyId,
  ]);
  const stG = await client.query(
    `select status from public.company_subscriptions where company_id = $1`,
    [grace.companyId],
  );
  assert.equal(stG.rows[0].status, "grace_period");
  const cGrace = await checkoutAndVerify(grace.companyId, `p276-grace-${grace.companyId}`);
  await client.query(`select public.settle_saas_verified_payment_v1($1)`, [cGrace.session.id]);
  const subG = await client.query(
    `select status, grace_period_ends_at from public.company_subscriptions where company_id = $1`,
    [grace.companyId],
  );
  assert.equal(subG.rows[0].status, "active");
  assert.equal(subG.rows[0].grace_period_ends_at, null);
  console.log("  ✓ grace recovery → active");

  // ── Rejections
  await expectFail(
    "not_verified",
    async () => {
      const co = await makeCompany("rej", packId, "active");
      const created = await client.query(
        `select public.create_billing_checkout_session_v1(
           'https://app.example/return', null, $1, $2, 'sandbox'
         ) as r`,
        [`p276-rej-${co.companyId}`, co.companyId],
      );
      await client.query(`select public.settle_saas_verified_payment_v1($1)`, [
        created.rows[0].r.session.id,
      ]);
    },
    /INVALID_PAYMENT_STATUS/,
  );
  console.log("  ✓ unsettleable checkout rejected");

  // Amount mismatch: tamper checkout amount after create (simulate lock breach)
  const tamper = await makeCompany("tamper", packId, "active");
  const cTamper = await checkoutAndVerify(tamper.companyId, `p276-tamper-${tamper.companyId}`);
  await client.query(`update public.billing_checkout_sessions set amount = 1 where id = $1`, [
    cTamper.session.id,
  ]);
  await expectFail(
    "amt",
    () => client.query(`select public.settle_saas_verified_payment_v1($1)`, [cTamper.session.id]),
    /AMOUNT_MISMATCH/,
  );
  console.log("  ✓ amount mismatch rejected");

  // Failed payment does not settle
  const failCo = await makeCompany("fail", packId, "active");
  const failCreated = await client.query(
    `select public.create_billing_checkout_session_v1(
       'https://app.example/return', null, $1, $2, 'sandbox'
     ) as r`,
    [`p276-fail-${failCo.companyId}`, failCo.companyId],
  );
  const fid = failCreated.rows[0].r.session.id;
  const fprov = `sandbox_cs_${fid}`;
  await client.query(
    `select public.attach_billing_checkout_provider_v1($1, $2, $3, 'sandbox', '{}'::jsonb)`,
    [fid, fprov, "https://app.example/return"],
  );
  await client.query(
    `select public.record_billing_checkout_payment_event_v1(
       'sandbox', $1, 'sandbox.payment.failed', 'failed',
       $2, null, $3, '{}'::jsonb, $4, 'declined', 'declined'
     )`,
    [`evt-fail-${fid}`, fprov, fid, `sandbox:evt-fail-${fid}`],
  );
  await expectFail(
    "fail_settle",
    () => client.query(`select public.settle_saas_verified_payment_v1($1)`, [fid]),
    /INVALID_PAYMENT_STATUS/,
  );
  const failSub = await client.query(
    `select status from public.company_subscriptions where company_id = $1`,
    [failCo.companyId],
  );
  assert.equal(failSub.rows[0].status, "active");
  console.log("  ✓ failed payment does not settle subscription");

  // Static: webhook wires settlement
  const webhookSrc = readFileSync(
    resolve(root, "artifacts/api-server/src/billing/saas/webhook-service.ts"),
    "utf8",
  );
  assert.match(webhookSrc, /settle_saas_verified_payment_v1/);
  assert.match(webhookSrc, /PAYMENT_VERIFIED/);
  console.log("  ✓ webhook invokes settlement on PAYMENT_VERIFIED");

  await client.query("rollback");
  console.log("\nAll Part 3 settlement checks passed.\n");
} catch (err) {
  try {
    await client.query("rollback");
  } catch {
    /* ignore */
  }
  console.error(err);
  process.exitCode = 1;
} finally {
  await client.end();
}
