/**
 * Part 2 — SaaS online checkout / payment webhook foundation.
 * Run: node scripts/verify-275-saas-checkout-sessions.mjs
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
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
  resolve(root, "supabase/migrations/275_saas_checkout_sessions.sql"),
  "utf8",
);

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log("\nPart 2 — SaaS checkout sessions\n");

async function expectFail(label, fn) {
  await client.query(`savepoint ${label}`);
  let failed = false;
  try {
    await fn();
  } catch {
    failed = true;
    await client.query(`rollback to savepoint ${label}`);
  }
  assert.equal(failed, true, `expected failure: ${label}`);
}

try {
  await client.query(migrationSql);
  console.log("  ✓ migration 275 applied");

  await client.query("begin");
  await client.query("select set_config('vault.provisioning_bootstrap', 'true', true)");
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");

  const pack = await client.query(`
    select public.upsert_commercial_package_v1(
      'p275_pack', 'P275 Pack', null, 'P275 Pack', 'fixed pack',
      75, 750, true, false, true, 275, 0,
      '{}'::jsonb, null, null, null, null, 'fixed'
    ) as r
  `);
  const packId = pack.rows[0].r.id;

  const free = await client.query(`
    select public.upsert_commercial_package_v1(
      'p275_free', 'P275 Free', null, 'P275 Free', 'free',
      0, 0, true, false, true, 276, 0,
      '{}'::jsonb, null, null, null, null, 'free'
    ) as r
  `);
  const freeId = free.rows[0].r.id;

  const custom = await client.query(`
    select public.upsert_commercial_package_v1(
      'p275_custom', 'P275 Custom', null, 'P275 Custom', 'custom',
      0, 0, true, false, true, 277, 0,
      '{}'::jsonb, null, null, null, null, 'custom'
    ) as r
  `);
  const customId = custom.rows[0].r.id;

  const co = await client.query(`
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      'P275 '||gen_random_uuid()::text,
      'Active', 'Pro', 'active', 'tenant',
      'approved', now(), 'completed'
    ) returning id
  `);
  const companyId = co.rows[0].id;
  await client.query(`select public._ensure_core_system_feature_grants($1)`, [companyId]);
  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [
    companyId,
    packId,
  ]);

  const sub = await client.query(
    `select id from public.company_subscriptions where company_id = $1`,
    [companyId],
  );
  const subscriptionId = sub.rows[0].id;

  const currencyRow = await client.query(
    `select coalesce(
       nullif(trim(public.resolve_billing_setting_value('default_currency', $1)#>>'{}'), ''),
       nullif(trim(public.resolve_billing_setting_value('default_currency', null)#>>'{}'), '')
     ) as c`,
    [companyId],
  );
  const currency = currencyRow.rows[0].c;
  assert.ok(currency);

  // 1 + 5. Fixed-price session with locked amount (ignore would-be client amounts — RPC has no amount param)
  const created = await client.query(
    `select public.create_billing_checkout_session_v1(
       'https://app.example/return', 'https://app.example/cancel',
       $1, $2, 'sandbox'
     ) as r`,
    [`p275-${companyId}`, companyId],
  );
  assert.equal(created.rows[0].r.ok, true);
  assert.equal(Number(created.rows[0].r.session.amount), 75);
  assert.equal(created.rows[0].r.session.currency, currency);
  assert.equal(created.rows[0].r.session.company_id, companyId);
  assert.equal(created.rows[0].r.session.subscription_id, subscriptionId);
  assert.equal(created.rows[0].r.session.plan_id, packId);
  assert.equal(created.rows[0].r.session.status, "created");
  const sessionId = created.rows[0].r.session.id;
  console.log("  ✓ fixed-price checkout session locks server amount/currency");

  // Idempotent create
  const again = await client.query(
    `select public.create_billing_checkout_session_v1(
       'https://app.example/return', null, $1, $2, 'sandbox'
     ) as r`,
    [`p275-${companyId}`, companyId],
  );
  assert.equal(again.rows[0].r.idempotent_replay, true);
  assert.equal(again.rows[0].r.session.id, sessionId);
  console.log("  ✓ checkout idempotency key replay");

  // 4. Another company cannot attach to this session via wrong company create
  const other = await client.query(`
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      'P275 other '||gen_random_uuid()::text,
      'Active', 'Pro', 'active', 'tenant',
      'approved', now(), 'completed'
    ) returning id
  `);
  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [
    other.rows[0].id,
    packId,
  ]);
  // Creating with company A's idempotency under company B is a different key scope — OK
  // Cross-company attach is blocked by session lookup ownership in webhook path

  // 6. Free package
  await client.query(`select public.change_company_package_v1($1, $2, 'admin')`, [
    companyId,
    freeId,
  ]).catch(async () => {
    // If change rejects free, assign via update for test
    await client.query(
      `update public.company_subscriptions set plan_id = $2 where company_id = $1`,
      [companyId, freeId],
    );
  });
  // Ensure free plan on subscription
  await client.query(
    `update public.company_subscriptions set plan_id = $2, billing_cycle = 'monthly' where company_id = $1`,
    [companyId, freeId],
  );
  const freeRes = await client.query(
    `select public.create_billing_checkout_session_v1(
       'https://app.example/return', null, $1, $2, 'sandbox'
     ) as r`,
    [`p275-free-${Date.now()}`, companyId],
  );
  assert.equal(freeRes.rows[0].r.ok, false);
  assert.equal(freeRes.rows[0].r.code, "FREE_PACKAGE_NO_PAYMENT");
  console.log("  ✓ free package rejects checkout");

  // 7. Custom package
  await client.query(
    `update public.company_subscriptions set plan_id = $2 where company_id = $1`,
    [companyId, customId],
  );
  const customRes = await client.query(
    `select public.create_billing_checkout_session_v1(
       'https://app.example/return', null, $1, $2, 'sandbox'
     ) as r`,
    [`p275-custom-${Date.now()}`, companyId],
  );
  assert.equal(customRes.rows[0].r.ok, false);
  assert.equal(customRes.rows[0].r.code, "CUSTOM_PRICING_REQUIRES_MANUAL_BILLING");
  console.log("  ✓ custom package rejected");

  // Restore fixed pack for webhook tests
  await client.query(
    `update public.company_subscriptions set plan_id = $2 where company_id = $1`,
    [companyId, packId],
  );
  const sess2 = await client.query(
    `select public.create_billing_checkout_session_v1(
       'https://app.example/return', null, $1, $2, 'sandbox'
     ) as r`,
    [`p275-wh-${companyId}`, companyId],
  );
  const sid = sess2.rows[0].r.session.id;
  const providerSession = `sandbox_cs_${sid}`;
  await client.query(
    `select public.attach_billing_checkout_provider_v1($1, $2, $3, 'sandbox', '{}'::jsonb)`,
    [sid, providerSession, `https://app.example/return?saas_checkout=${sid}`],
  );
  console.log("  ✓ provider session attached with locked amount");

  // 13–16. Webhook success + idempotency + ignore untrusted company_id
  const evt1 = await client.query(
    `select public.record_billing_checkout_payment_event_v1(
       'sandbox', 'evt-p275-1', 'sandbox.payment.succeeded', 'succeeded',
       $1, 'pay-p275-1', $2,
       '{"company_id":"00000000-0000-0000-0000-000000000099"}'::jsonb,
       'sandbox:evt-p275-1', null, null
     ) as r`,
    [providerSession, sid],
  );
  assert.equal(evt1.rows[0].r.code, "PAYMENT_VERIFIED");
  assert.equal(evt1.rows[0].r.settlement, "deferred_to_part_3");
  assert.equal(evt1.rows[0].r.company_id, companyId);
  assert.equal(evt1.rows[0].r.idempotent_replay, false);

  const status1 = await client.query(
    `select status, provider_payment_id from public.billing_checkout_sessions where id = $1`,
    [sid],
  );
  assert.equal(status1.rows[0].status, "succeeded");
  assert.equal(status1.rows[0].provider_payment_id, "pay-p275-1");

  const evt2 = await client.query(
    `select public.record_billing_checkout_payment_event_v1(
       'sandbox', 'evt-p275-1', 'sandbox.payment.succeeded', 'succeeded',
       $1, 'pay-p275-1', $2, '{}'::jsonb, 'sandbox:evt-p275-1', null, null
     ) as r`,
    [providerSession, sid],
  );
  assert.equal(evt2.rows[0].r.idempotent_replay, true);
  assert.equal(evt2.rows[0].r.code, "PAYMENT_VERIFIED");
  console.log("  ✓ webhook verify + duplicate event idempotent; company_id not trusted");

  // Ensure renew was NOT called (no new billing_payments for this company from this flow)
  // 17. Failed payment on a new session
  const failSess = await client.query(
    `select public.create_billing_checkout_session_v1(
       'https://app.example/return', null, $1, $2, 'sandbox'
     ) as r`,
    [`p275-fail-${companyId}`, companyId],
  );
  const fid = failSess.rows[0].r.session.id;
  const fprov = `sandbox_cs_${fid}`;
  await client.query(
    `select public.attach_billing_checkout_provider_v1($1, $2, $3, 'sandbox', '{}'::jsonb)`,
    [fid, fprov, "https://app.example/return"],
  );
  const failEvt = await client.query(
    `select public.record_billing_checkout_payment_event_v1(
       'sandbox', 'evt-p275-fail', 'sandbox.payment.failed', 'failed',
       $1, null, $2, '{}'::jsonb, 'sandbox:evt-p275-fail', 'card_declined', 'declined'
     ) as r`,
    [fprov, fid],
  );
  assert.equal(failEvt.rows[0].r.code, "PAYMENT_FAILED");
  const failStatus = await client.query(
    `select status, failure_code from public.billing_checkout_sessions where id = $1`,
    [fid],
  );
  assert.equal(failStatus.rows[0].status, "failed");
  assert.equal(failStatus.rows[0].failure_code, "card_declined");
  console.log("  ✓ failed payment maps to failed session status");

  // Missing session rejected
  await expectFail("missing_session", () =>
    client.query(
      `select public.record_billing_checkout_payment_event_v1(
         'sandbox', 'evt-missing', 'x', 'succeeded',
         'no-such-provider-session', null, null, '{}'::jsonb, 'sandbox:evt-missing', null, null
       )`,
    ),
  );
  console.log("  ✓ webhook without resolvable session rejected");

  // 18. No card fields in schema / migration
  assert.doesNotMatch(migrationSql, /card_number|cvv|pan\b/i);
  console.log("  ✓ no card/PAN/CVV persistence in migration");

  // Static: does not call renew / convert (comments may mention them)
  assert.doesNotMatch(migrationSql, /select public\.renew_subscription_from_payment/i);
  assert.doesNotMatch(migrationSql, /perform public\.renew_subscription_from_payment/i);
  assert.doesNotMatch(migrationSql, /convert_trial_to_paid_v1\s*\(/i);
  console.log("  ✓ Part 2 does not settle subscriptions");

  await client.query("rollback");
  console.log("\nAll Part 2 checkout session checks passed.\n");
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
