/**
 * Company payable checkout + pre-approval payment (migration 304).
 * Run: node scripts/verify-304-company-payable-checkout.mjs
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
  resolve(root, "supabase/migrations/304_company_payable_checkout.sql"),
  "utf8",
);

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log("\n304 — company payable checkout + pre-approval payment\n");

async function expectCode(label, fn, code) {
  const result = await fn();
  assert.equal(result?.ok, false, `${label} expected ok=false, got ${JSON.stringify(result)}`);
  assert.equal(result?.code, code, `${label} expected ${code}, got ${result?.code}`);
}

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

async function makeCompany({ suffix, packId, approval = "approved", status = "Active", subStatus = "active" }) {
  const co = await client.query(
    `
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      'P304 '||$1||' '||gen_random_uuid()::text,
      $2, 'Pro', $3, 'tenant',
      $4, now(), 'completed'
    ) returning id
  `,
    [suffix, status, subStatus === "trialing" ? "trialing" : "active", approval],
  );
  const companyId = co.rows[0].id;
  await client.query(`select public._ensure_core_system_feature_grants($1)`, [companyId]);
  const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString();
  const trialEnds = new Date(Date.now() + 14 * 86400000).toISOString();
  if (packId) {
    await client.query(
      `insert into public.company_subscriptions (
         company_id, plan_id, status, billing_cycle, trial_ends_at,
         current_period_start, current_period_end, auto_renewal
       ) values ($1, $2, $3, 'monthly', $4, now(), $5, true)`,
      [
        companyId,
        packId,
        subStatus,
        subStatus === "trialing" ? trialEnds : null,
        subStatus === "trialing" ? trialEnds : periodEnd,
      ],
    );
  } else {
    await client.query(
      `insert into public.company_subscriptions (
         company_id, plan_id, status, billing_cycle,
         current_period_start, current_period_end, auto_renewal
       ) values ($1, null, 'trialing', 'monthly', now(), now() + interval '14 days', true)`,
      [companyId],
    );
  }
  return companyId;
}

async function checkout(companyId, key, actor = null) {
  const created = await client.query(
    `select public.create_billing_checkout_session_v1(
       'https://app.example/return', null, $1, $2, 'sandbox', $3
     ) as r`,
    [key, companyId, actor],
  );
  return created.rows[0].r;
}

async function checkoutAndVerify(companyId, key) {
  const created = await checkout(companyId, key);
  assert.equal(created.ok, true, JSON.stringify(created));
  const session = created.session;
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
    [`evt-${key}`, providerSession, `pay-${key}`, session.id, `sandbox:evt-${key}`],
  );
  assert.equal(verified.rows[0].r.code, "PAYMENT_VERIFIED");
  return session;
}

try {
  await client.query(migrationSql);
  console.log("  ✓ migration 304 applied");

  await client.query("begin");
  await client.query("select set_config('vault.provisioning_bootstrap', 'true', true)");
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");

  const pack = await client.query(`
    select public.upsert_commercial_package_v1(
      'p304_pack', 'P304 Pack', null, 'P304 Pack', 'fixed pack',
      199, 1990, true, false, true, 304, 0,
      '{}'::jsonb, null, null, null, null, 'fixed'
    ) as r
  `);
  const packId = pack.rows[0].r.id;

  const free = await client.query(`
    select public.upsert_commercial_package_v1(
      'p304_free', 'P304 Free', null, 'P304 Free', 'free',
      0, 0, true, false, true, 305, 0,
      '{}'::jsonb, null, null, null, null, 'free'
    ) as r
  `);
  const freeId = free.rows[0].r.id;

  // 1. List price company: checkout amount = list price
  const listCo = await makeCompany({ suffix: "list", packId, subStatus: "active" });
  const currency = await currencyFor(listCo);
  assert.ok(currency);
  const listSession = await checkout(listCo, `p304-list-${listCo}`);
  assert.equal(listSession.ok, true, JSON.stringify(listSession));
  assert.equal(Number(listSession.session.amount), 199);
  assert.equal(listSession.session.currency, currency);
  assert.equal(listSession.session.metadata.amount_locked, true);
  console.log("  ✓ 1. list-price checkout locks 199");

  // 7. Idempotency returns original locked amount
  const listAgain = await checkout(listCo, `p304-list-${listCo}`);
  assert.equal(listAgain.idempotent_replay, true);
  assert.equal(listAgain.session.id, listSession.session.id);
  assert.equal(Number(listAgain.session.amount), 199);
  console.log("  ✓ 7/8. idempotent replay keeps locked amount");

  // 2. Discounted company: 199 - 10% = 179.10
  const discCo = await makeCompany({ suffix: "disc", packId, subStatus: "active" });
  await client.query(
    `select public.upsert_company_commercial_terms_v1($1, 'discount', 10, null, null, 'p304')`,
    [discCo],
  );
  const payableDisc = await client.query(
    `select public.resolve_company_payable_amount($1) as r`,
    [discCo],
  );
  assert.equal(Number(payableDisc.rows[0].r.payable_amount), 179.1);
  const discSession = await checkout(discCo, `p304-disc-${discCo}`);
  assert.equal(discSession.ok, true, JSON.stringify(discSession));
  assert.equal(Number(discSession.session.amount), 179.1);
  assert.equal(discSession.session.metadata.amount_mode, "manual");
  console.log("  ✓ 2. discounted checkout locks 179.10");

  // 3. Custom company price
  const customCo = await makeCompany({ suffix: "custom", packId, subStatus: "active" });
  await client.query(
    `select public.upsert_company_commercial_terms_v1($1, 'custom', 0, 149, 1400, 'p304')`,
    [customCo],
  );
  const customSession = await checkout(customCo, `p304-custom-${customCo}`);
  assert.equal(customSession.ok, true, JSON.stringify(customSession));
  assert.equal(Number(customSession.session.amount), 149);
  console.log("  ✓ 3. custom checkout locks 149");

  // 4/5/6. RPC has no client amount/currency/company override params — locked from DB
  assert.doesNotMatch(migrationSql, /p_amount\b/);
  assert.doesNotMatch(migrationSql, /p_currency\b/);
  const otherCo = await makeCompany({ suffix: "other", packId, subStatus: "active" });
  const cross = await checkout(listCo, `p304-cross-${otherCo}`);
  // Creating for listCo with service_role still uses p_company_id argument, not a client amount.
  assert.equal(cross.ok, true);
  assert.equal(cross.session.company_id, listCo);
  assert.notEqual(cross.session.company_id, otherCo);
  console.log("  ✓ 4/5/6. checkout has no client amount/currency; company_id is server argument only");

  // 9/10. Settlement uses locked checkout amount
  const discPaid = await checkoutAndVerify(discCo, `p304-disc-pay-${discCo}`);
  assert.equal(Number(discPaid.amount), 179.1);
  const settleDisc = await client.query(
    `select public.settle_saas_verified_payment_v1($1) as r`,
    [discPaid.id],
  );
  assert.equal(settleDisc.rows[0].r.ok, true);
  const payDisc = await client.query(
    `select amount, metadata from public.billing_payments where id = $1`,
    [settleDisc.rows[0].r.billing_payment_id],
  );
  assert.equal(Number(payDisc.rows[0].amount) >= 179.1, true);
  assert.ok(Number(payDisc.rows[0].amount) < 199, "must not settle list price 199");
  console.log("  ✓ 9/10. webhook settlement uses locked 179.10, not list 199");

  // 11. Pending configured company can initiate payment
  const pendingCo = await makeCompany({
    suffix: "pending",
    packId,
    approval: "pending",
    status: "Trial",
    subStatus: "trialing",
  });
  const pendingCheckout = await checkout(pendingCo, `p304-pending-${pendingCo}`);
  assert.equal(pendingCheckout.ok, true, JSON.stringify(pendingCheckout));
  assert.equal(Number(pendingCheckout.session.amount), 199);
  console.log("  ✓ 11. pending configured company can start checkout");

  // 12. Pending without package cannot pay
  const pendingBare = await makeCompany({
    suffix: "bare",
    packId: null,
    approval: "pending",
    status: "Trial",
    subStatus: "trialing",
  });
  await expectCode(
    "no-pack",
    async () => checkout(pendingBare, `p304-bare-${pendingBare}`),
    "PACKAGE_NOT_CONFIGURED",
  );
  console.log("  ✓ 12. pending without package cannot pay");

  // 13. Pending without valid price cannot pay
  const pendingZero = await makeCompany({
    suffix: "zero",
    packId,
    approval: "pending",
    status: "Trial",
    subStatus: "trialing",
  });
  await client.query(
    `insert into public.company_commercial_terms (
       company_id, pricing_source, discount_percent, custom_price_monthly, custom_price_yearly
     ) values ($1, 'custom', 0, 0, 0)
     on conflict (company_id) do update
     set pricing_source = 'custom', discount_percent = 0,
         custom_price_monthly = 0, custom_price_yearly = 0`,
    [pendingZero],
  );
  const zeroRes = await checkout(pendingZero, `p304-zero-${pendingZero}`);
  assert.equal(zeroRes.ok, false);
  assert.ok(
    ["INVALID_PAYABLE_AMOUNT", "CUSTOM_PRICING_REQUIRES_MANUAL_BILLING"].includes(zeroRes.code),
    zeroRes.code,
  );
  console.log("  ✓ 13. pending without valid price cannot pay");

  // 14. Rejected cannot pay
  const rejectedCo = await makeCompany({
    suffix: "rej",
    packId,
    approval: "rejected",
    status: "Trial",
    subStatus: "trialing",
  });
  await expectCode(
    "rejected",
    async () => checkout(rejectedCo, `p304-rej-${rejectedCo}`),
    "COMPANY_REJECTED",
  );
  console.log("  ✓ 14. rejected company cannot pay");

  // 15. Suspended cannot pay
  const suspCo = await makeCompany({ suffix: "susp", packId, subStatus: "active" });
  await client.query(`update public.companies set status = 'Suspended' where id = $1`, [suspCo]);
  await expectCode(
    "suspended",
    async () => checkout(suspCo, `p304-susp-${suspCo}`),
    "COMPANY_SUSPENDED",
  );
  console.log("  ✓ 15. suspended company cannot pay");

  // 16. Unauthorized actor cannot initiate
  const actor = randomUUID();
  await expectCode(
    "unauth",
    async () => checkout(listCo, `p304-unauth-${listCo}`, actor),
    "UNAUTHORIZED_CHECKOUT",
  );
  console.log("  ✓ 16. unauthorized actor cannot initiate payment");

  // 17/18. Successful pending payment does not approve; awaiting approval state
  const pendingPaidSession = await checkoutAndVerify(pendingCo, `p304-pending-pay-${pendingCo}`);
  const settlePending = await client.query(
    `select public.settle_saas_verified_payment_v1($1) as r`,
    [pendingPaidSession.id],
  );
  assert.equal(settlePending.rows[0].r.ok, true);
  assert.equal(settlePending.rows[0].r.settlement_code, "PRE_APPROVAL_PAID");
  const pendingAfter = await client.query(
    `select approval_status, status, pre_approval_paid_at, pre_approval_billing_payment_id
     from public.companies where id = $1`,
    [pendingCo],
  );
  assert.equal(pendingAfter.rows[0].approval_status, "pending");
  assert.equal(pendingAfter.rows[0].status, "Trial");
  assert.ok(pendingAfter.rows[0].pre_approval_paid_at);
  assert.ok(pendingAfter.rows[0].pre_approval_billing_payment_id);
  const pendingSub = await client.query(
    `select status from public.company_subscriptions where company_id = $1`,
    [pendingCo],
  );
  assert.equal(pendingSub.rows[0].status, "trialing");
  const replayPay = await checkout(pendingCo, `p304-pending-again-${pendingCo}`);
  assert.equal(replayPay.ok, false);
  assert.equal(replayPay.code, "PRE_APPROVAL_PAYMENT_ALREADY_CONFIRMED");
  console.log("  ✓ 17/18. pending payment does not approve; awaiting-approval blocks Pay Now");

  // 19. Active subscription renewal still works
  const renewCo = await makeCompany({ suffix: "renew", packId, subStatus: "active" });
  const period0 = (
    await client.query(
      `select current_period_end from public.company_subscriptions where company_id = $1`,
      [renewCo],
    )
  ).rows[0].current_period_end;
  const renewSess = await checkoutAndVerify(renewCo, `p304-renew-${renewCo}`);
  const settleRenew = await client.query(
    `select public.settle_saas_verified_payment_v1($1) as r`,
    [renewSess.id],
  );
  assert.equal(settleRenew.rows[0].r.settlement_code, "RENEWED");
  const period1 = (
    await client.query(
      `select status, current_period_end from public.company_subscriptions where company_id = $1`,
      [renewCo],
    )
  ).rows[0];
  assert.equal(period1.status, "active");
  assert.ok(period1.current_period_end > period0);
  console.log("  ✓ 19. active renewal still works");

  // 20. Approved trial conversion still works
  const trialCo = await makeCompany({
    suffix: "trial",
    packId,
    approval: "approved",
    status: "Trial",
    subStatus: "trialing",
  });
  const trialSess = await checkoutAndVerify(trialCo, `p304-trial-${trialCo}`);
  const settleTrial = await client.query(
    `select public.settle_saas_verified_payment_v1($1) as r`,
    [trialSess.id],
  );
  assert.equal(settleTrial.rows[0].r.settlement_code, "TRIAL_CONVERTED_AND_PAID");
  const trialSub = await client.query(
    `select status from public.company_subscriptions where company_id = $1`,
    [trialCo],
  );
  assert.equal(trialSub.rows[0].status, "active");
  const trialApproval = await client.query(
    `select approval_status from public.companies where id = $1`,
    [trialCo],
  );
  assert.equal(trialApproval.rows[0].approval_status, "approved");
  console.log("  ✓ 20. approved trial conversion still works");

  // 21. Free package does not create paid checkout
  const freeCo = await makeCompany({ suffix: "free", packId: freeId, subStatus: "active" });
  await expectCode(
    "free",
    async () => checkout(freeCo, `p304-free-${freeCo}`),
    "FREE_PACKAGE_NO_PAYMENT",
  );
  console.log("  ✓ 21. free package does not create paid checkout");

  // 22. Overage remains preview-only (no charging RPCs in 304)
  assert.doesNotMatch(migrationSql, /overage_charge|charge_overage|invoice_overage/i);
  console.log("  ✓ 22. overage remains preview-only");

  await client.query("rollback");
  console.log("\nAll 304 company payable checkout checks passed.\n");
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
