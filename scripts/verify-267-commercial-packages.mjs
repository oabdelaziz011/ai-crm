/**
 * Phase 7.2 commercial packages — live DB matrix.
 * Run: node scripts/verify-267-commercial-packages.mjs
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
console.log("\nPhase 7.2 commercial packages verification\n");

async function feature(companyId, code) {
  const r = await client.query(`select public.is_feature_enabled($1, $2) as e`, [companyId, code]);
  return Boolean(r.rows[0].e);
}

try {
  await client.query("begin");
  await client.query("select set_config('vault.provisioning_bootstrap', 'true', true)");
  // Impersonate service_role semantics for SECURITY DEFINER auth.role checks where needed
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");

  // Create Growth + Starter packages
  const growth = await client.query(`
    select public.upsert_commercial_package_v1(
      'growth_p72', 'Growth P72', null, 'Growth P72', 'Growth test pack',
      49, 490, true, true, true, 10, 2
    ) as r
  `);
  const growthId = growth.rows[0].r.id ?? growth.rows[0].r.plan_id;
  assert.ok(growthId, "growth package id");

  await client.query(`select public.set_commercial_package_features_v1($1, $2)`, [
    growthId,
    ["core_crm", "customers", "leads", "bookings", "ticketing"],
  ]);

  const starter = await client.query(`
    select public.upsert_commercial_package_v1(
      'starter_p72', 'Starter P72', null, 'Starter P72', 'Starter test pack',
      19, 190, true, false, true, 5, 1
    ) as r
  `);
  const starterId = starter.rows[0].r.id ?? starter.rows[0].r.plan_id;
  assert.ok(starterId);

  await client.query(`select public.set_commercial_package_features_v1($1, $2)`, [
    starterId,
    ["core_crm", "customers", "leads", "bookings"],
  ]);
  console.log("  ✓ create packages + set features");

  // Catalog edit does not touch subscriptions — create company after growth features set
  const co = await client.query(`
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      'P72 Pack '||gen_random_uuid()::text,
      'Active', 'Pro', 'active', 'tenant',
      'approved', now(), 'completed'
    ) returning id
  `);
  const companyId = co.rows[0].id;
  await client.query(`select public._ensure_core_system_feature_grants($1)`, [companyId]);
  if ((await client.query(`select to_regprocedure('public._ensure_company_subscription_row(uuid)') is not null as ok`)).rows[0].ok) {
    await client.query(`select public._ensure_company_subscription_row($1)`, [companyId]);
  } else {
    await client.query(
      `insert into public.company_subscriptions (company_id, status, billing_cycle)
       values ($1, 'active', 'monthly') on conflict (company_id) do nothing`,
      [companyId],
    );
  }

  // Assign Growth
  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [companyId, growthId]);
  assert.equal(await feature(companyId, "leads"), true);
  assert.equal(await feature(companyId, "bookings"), true);
  assert.equal(await feature(companyId, "ticketing"), true);
  assert.equal(await feature(companyId, "whatsapp_channel"), false);
  console.log("  ✓ assign Growth provisions package grants");

  // Manual whatsapp survives
  await client.query(
    `select public.set_company_feature_grant($1, 'whatsapp_channel', true, 'manual', now(), null, 'p72-manual')`,
    [companyId],
  );
  assert.equal(await feature(companyId, "whatsapp_channel"), true);

  // Change Growth → Starter
  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [companyId, starterId]);
  assert.equal(await feature(companyId, "leads"), true);
  assert.equal(await feature(companyId, "bookings"), true);
  assert.equal(await feature(companyId, "ticketing"), false);
  assert.equal(await feature(companyId, "whatsapp_channel"), true);
  assert.equal(await feature(companyId, "core_crm"), true);
  assert.equal(await feature(companyId, "customers"), true);
  console.log("  ✓ package change: ticketing removed (package), whatsapp manual preserved");

  // Contract grant survives
  await client.query(
    `select public.set_company_feature_grant($1, 'ai_employee', true, 'contract', now(), null, 'p72-contract')`,
    [companyId],
  );
  await client.query(`select public.assign_company_package_v1($1, $2, 'monthly')`, [companyId, starterId]);
  assert.equal(await feature(companyId, "ai_employee"), true);
  console.log("  ✓ contract grant survives package re-assign");

  // Editing package catalog does not mutate assigned snapshot grants unexpectedly:
  // remove leads from starter catalog — company should still have leads until reassigned
  await client.query(`select public.set_commercial_package_features_v1($1, $2)`, [
    starterId,
    ["core_crm", "customers", "bookings"],
  ]);
  assert.equal(await feature(companyId, "leads"), true);
  console.log("  ✓ catalog edit does not revoke existing package grants");

  // Deactivate growth package — assigned companies unaffected (we are on starter)
  await client.query(`
    select public.upsert_commercial_package_v1(
      'growth_p72', 'Growth P72', $1, 'Growth P72', 'Growth test pack',
      49, 490, false, true, true, 10, 2
    )
  `, [growthId]);
  assert.equal(await feature(companyId, "bookings"), true);
  console.log("  ✓ package deactivation does not revoke current company access");

  // Pending deny still works
  await client.query(`update public.companies set approval_status = 'pending' where id = $1`, [companyId]);
  assert.equal(await feature(companyId, "leads"), false);
  assert.equal(await feature(companyId, "core_crm"), true);
  console.log("  ✓ pending still denies commercial (Phase 6 intact)");

  await client.query(`update public.companies set approval_status = 'approved', status = 'Suspended' where id = $1`, [companyId]);
  assert.equal(await feature(companyId, "leads"), false);
  console.log("  ✓ suspended still denies commercial");

  // Audit events exist
  const audit = await client.query(`
    select count(*)::int as n from public.billing_audit_event_types
    where code in ('package_created','package_assigned','package_changed','package_features_updated')
  `);
  assert.ok(audit.rows[0].n >= 4);
  console.log("  ✓ package audit event types present");

  await client.query("rollback");
  console.log("\nPhase 7.2 package verification passed\n");
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
