/**
 * Phase 7.3 — package ↔ feature mapping integrity + packaging-not-auth.
 * Run: node scripts/verify-268-commercial-package-mapping.mjs
 */
import assert from "node:assert/strict";
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const root = resolveProjectRoot(import.meta.url);
const env = loadProjectEnv(root);
if (!env.DATABASE_URL?.trim()) {
  console.log("DATABASE_URL missing — skip");
  process.exit(0);
}

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log("\nPhase 7.3 commercial package mapping verification\n");

const BASIC = ["basic_reports", "bookings", "core_crm", "customers", "ticketing"];
const PRO = [
  ...BASIC,
  "ai_assistant",
  "leads",
  "opportunities",
  "whatsapp_channel",
].sort();
const ENTERPRISE = [
  ...PRO,
  "advanced_reports",
  "ai_employee",
  "api_access",
  "email_channel",
  "omnichannel",
  "operations",
  "workflow_automation",
].sort();

async function feature(companyId, code) {
  const r = await client.query(`select public.is_feature_enabled($1, $2) as e`, [companyId, code]);
  return Boolean(r.rows[0].e);
}

async function packageCodes(code) {
  const r = await client.query(
    `select array_agg(feature_code order by feature_code) as codes
     from public.commercial_package_feature_matrix_v1
     where package_code = $1`,
    [code],
  );
  return (r.rows[0]?.codes ?? []).slice().sort();
}

try {
  await client.query("begin");
  await client.query("select set_config('vault.provisioning_bootstrap', 'true', true)");
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");

  // A/B — catalog + package mapping integrity
  const integrity = await client.query(
    `select public.verify_commercial_package_mapping_integrity_v1() as r`,
  );
  assert.equal(integrity.rows[0].r.ok, true, JSON.stringify(integrity.rows[0].r));
  console.log("  ✓ feature catalog + package mapping integrity");

  // C/D — core free classification / commercial classification
  const classification = await client.query(`
    select code, default_enabled, is_billable, requires_subscription
    from public.feature_definitions
    where code in ('core_crm','customers','leads','ai_assistant','api_access')
  `);
  const byCode = Object.fromEntries(classification.rows.map((row) => [row.code, row]));
  assert.equal(byCode.core_crm.is_billable, false);
  assert.equal(byCode.customers.requires_subscription, false);
  assert.equal(byCode.leads.is_billable, true);
  assert.equal(byCode.ai_assistant.default_enabled, false);
  assert.equal(byCode.api_access.requires_subscription, true);
  console.log("  ✓ core remain free; commercial remain commercial");

  // E — Basic/Pro/Enterprise mappings from DB view
  assert.deepEqual(await packageCodes("basic"), BASIC);
  assert.deepEqual(await packageCodes("pro"), PRO);
  assert.deepEqual(await packageCodes("enterprise"), ENTERPRISE);
  console.log("  ✓ Basic/Pro/Enterprise matrix matches Phase 7.2 stock");

  // F/G — assign + snapshot
  const pack = await client.query(`
    select public.upsert_commercial_package_v1(
      'map_p73', 'Map P73', null, 'Map P73', 'mapping test',
      25, 250, true, false, true, 20, 2
    ) as r
  `);
  const packId = pack.rows[0].r.id ?? pack.rows[0].r.plan_id;
  await client.query(`select public.set_commercial_package_features_v1($1, $2)`, [
    packId,
    ["core_crm", "customers", "leads", "bookings"],
  ]);

  const co = await client.query(`
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      'P73 Map '||gen_random_uuid()::text,
      'Active', 'Pro', 'active', 'tenant',
      'approved', now(), 'completed'
    ) returning id
  `);
  const companyId = co.rows[0].id;
  await client.query(`select public._ensure_core_system_feature_grants($1)`, [companyId]);
  await client.query(
    `insert into public.company_subscriptions (company_id, status, billing_cycle)
     values ($1, 'active', 'monthly') on conflict (company_id) do nothing`,
    [companyId],
  );

  await client.query(`select public.assign_company_package_v1($1, $2, 'yearly')`, [
    companyId,
    packId,
  ]);
  const snap = await client.query(
    `select billing_cycle, package_feature_snapshot, plan_id
     from public.company_subscriptions where company_id = $1`,
    [companyId],
  );
  assert.equal(snap.rows[0].billing_cycle, "yearly");
  assert.equal(snap.rows[0].plan_id, packId);
  const snapshotCodes = [...(snap.rows[0].package_feature_snapshot ?? [])].sort();
  assert.deepEqual(snapshotCodes, ["bookings", "core_crm", "customers", "leads"]);
  assert.equal(await feature(companyId, "leads"), true);
  console.log("  ✓ package assignment + snapshot + yearly cycle");

  // S — plan_features alone cannot authorize: seed plan_features for a feature
  // without creating a package grant, then ensure access stays denied.
  await client.query(
    `insert into public.plan_features (plan_id, feature_code, enabled)
     values ($1, 'whatsapp_channel', true)
     on conflict (plan_id, feature_code) do update set enabled = true`,
    [packId],
  );
  assert.equal(await feature(companyId, "whatsapp_channel"), false);
  console.log("  ✓ plan_features cannot authorize runtime access");

  // H — catalog edit safety
  await client.query(`select public.set_commercial_package_features_v1($1, $2)`, [
    packId,
    ["core_crm", "customers", "bookings"],
  ]);
  assert.equal(await feature(companyId, "leads"), true);
  console.log("  ✓ catalog edit does not revoke existing package grants");

  // J/K/L/M/N — downgrade + grant survival
  const smaller = await client.query(`
    select public.upsert_commercial_package_v1(
      'map_p73_small', 'Map P73 Small', null, 'Map P73 Small', 'small',
      10, 100, true, false, true, 21, 1
    ) as r
  `);
  const smallId = smaller.rows[0].r.id ?? smaller.rows[0].r.plan_id;
  await client.query(`select public.set_commercial_package_features_v1($1, $2)`, [
    smallId,
    ["core_crm", "customers"],
  ]);

  await client.query(
    `select public.set_company_feature_grant($1, 'api_access', true, 'manual', now(), null, 'p73-manual')`,
    [companyId],
  );
  await client.query(
    `select public.set_company_feature_grant($1, 'advanced_reports', true, 'contract', now(), null, 'p73-contract')`,
    [companyId],
  );
  await client.query(
    `select public.set_company_feature_grant($1, 'omnichannel', true, 'trial', now(), null, 'p73-trial')`,
    [companyId],
  );

  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [
    companyId,
    smallId,
  ]);
  assert.equal(await feature(companyId, "leads"), false);
  assert.equal(await feature(companyId, "bookings"), false);
  assert.equal(await feature(companyId, "api_access"), true);
  assert.equal(await feature(companyId, "advanced_reports"), true);
  assert.equal(await feature(companyId, "omnichannel"), true);
  assert.equal(await feature(companyId, "core_crm"), true);
  assert.equal(await feature(companyId, "customers"), true);
  console.log("  ✓ downgrade revokes package grants only; manual/contract/trial/system survive");

  // I — deactivation safety
  await client.query(`
    select public.upsert_commercial_package_v1(
      'map_p73', 'Map P73', $1, 'Map P73', 'mapping test',
      25, 250, false, false, true, 20, 2
    )
  `, [packId]);
  assert.equal(await feature(companyId, "core_crm"), true);
  console.log("  ✓ package deactivation does not revoke existing access");

  // Inactive package not assignable
  await client.query("savepoint before_inactive_assign");
  let blocked = false;
  try {
    await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [
      companyId,
      packId,
    ]);
  } catch {
    blocked = true;
    await client.query("rollback to savepoint before_inactive_assign");
  }
  assert.equal(blocked, true);
  console.log("  ✓ inactive package cannot be newly assigned");

  // O/P/Q — Phase 6 approval/suspension
  await client.query(`update public.companies set approval_status = 'pending' where id = $1`, [
    companyId,
  ]);
  assert.equal(await feature(companyId, "api_access"), false);
  assert.equal(await feature(companyId, "core_crm"), true);

  await client.query(`update public.companies set approval_status = 'rejected' where id = $1`, [
    companyId,
  ]);
  assert.equal(await feature(companyId, "api_access"), false);

  await client.query(
    `update public.companies set approval_status = 'approved', status = 'Suspended' where id = $1`,
    [companyId],
  );
  assert.equal(await feature(companyId, "api_access"), false);
  console.log("  ✓ pending/rejected/suspended still deny commercial (Phase 6 intact)");

  // W — audit types present
  const audit = await client.query(`
    select count(*)::int as n from public.billing_audit_event_types
    where code in (
      'package_created','package_updated','package_activated','package_deactivated',
      'package_assigned','package_changed','package_removed','package_features_updated'
    )
  `);
  assert.ok(audit.rows[0].n >= 7);
  console.log("  ✓ package audit event types present");

  await client.query("rollback");
  console.log("\nPhase 7.3 package mapping verification passed\n");
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    /* ignore */
  }
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
