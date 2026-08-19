/**
 * Live DB checks for Phase 6 approval + commercial deny.
 * Run: node scripts/verify-266-commercial-access.mjs
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
console.log("\nPhase 6 live commercial access verification\n");

async function feature(companyId, code) {
  const r = await client.query(`select public.is_feature_enabled($1, $2) as e`, [companyId, code]);
  return Boolean(r.rows[0].e);
}

async function accessState(companyId) {
  const r = await client.query(`select public.get_company_access_state($1) as s`, [companyId]);
  return r.rows[0].s;
}

try {
  // Read-only: live pending companies must not receive commercial access
  // from existing trial/system grants. Do not mutate their rows.
  const named = await client.query(`
    select c.id, c.name, c.approval_status, c.status
    from public.companies c
    where c.name in ('Auto Test Co', 'Elnesma', 'Retest Co')
    order by c.name
  `);
  assert.equal(named.rows.length, 3, "expected Auto Test Co, Elnesma, Retest Co");
  for (const row of named.rows) {
    assert.equal(row.approval_status, "pending", `${row.name} should still be pending`);
    assert.equal(await feature(row.id, "bookings"), false, `${row.name} bookings`);
    assert.equal(await feature(row.id, "finance"), false, `${row.name} finance`);
    assert.equal(await feature(row.id, "core_crm"), true, `${row.name} core_crm`);
    assert.equal(await accessState(row.id), "expired", `${row.name} access state`);
    console.log(`  ✓ live pending ${row.name}: commercial DENY, core ALLOW`);
  }

  await client.query("begin");
  await client.query("select set_config('vault.provisioning_bootstrap', 'true', true)");
  await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");

  const matrix = await client.query(`
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      'Phase6 Gate '||gen_random_uuid()::text,
      'Active', 'Pro', 'active', 'tenant',
      'approved', now(), 'completed'
    ) returning id
  `);
  const companyId = matrix.rows[0].id;
  await client.query(`select public._ensure_core_system_feature_grants($1)`, [companyId]);
  await client.query(
    `select public.set_company_feature_grant($1, 'bookings', true, 'manual', now(), null, 'phase6-gate')`,
    [companyId],
  );

  // A
  assert.equal(await feature(companyId, "bookings"), true);
  console.log("  ✓ A approved + commercial entitlement → TRUE");

  // B
  await client.query(`update public.companies set approval_status = 'pending' where id = $1`, [companyId]);
  assert.equal(await feature(companyId, "bookings"), false);
  console.log("  ✓ B pending + commercial entitlement → FALSE");

  // C
  await client.query(`update public.companies set approval_status = 'rejected' where id = $1`, [companyId]);
  assert.equal(await feature(companyId, "bookings"), false);
  console.log("  ✓ C rejected + commercial entitlement → FALSE");

  // D
  await client.query(
    `update public.companies set approval_status = 'approved', status = 'Suspended' where id = $1`,
    [companyId],
  );
  assert.equal(await feature(companyId, "bookings"), false);
  console.log("  ✓ D suspended + commercial entitlement → FALSE");

  // E
  await client.query(
    `update public.companies set approval_status = 'approved', status = 'Active' where id = $1`,
    [companyId],
  );
  assert.equal(await feature(companyId, "leads"), false);
  console.log("  ✓ E approved + no commercial entitlement → FALSE");

  // F
  assert.equal(await feature(companyId, "core_crm"), true);
  await client.query(`update public.companies set approval_status = 'pending' where id = $1`, [companyId]);
  assert.equal(await feature(companyId, "core_crm"), true);
  console.log("  ✓ F approved/pending + core feature → TRUE");

  const pending = await client.query(`
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      'Phase6 Pending '||gen_random_uuid()::text,
      'Trial', 'Basic', 'trialing', 'tenant',
      'pending', now(), 'completed'
    ) returning id
  `);
  const pendingId = pending.rows[0].id;
  await client.query(`select public._ensure_core_system_feature_grants($1)`, [pendingId]);

  const feat = await client.query(`
    select code from public.feature_definitions
    where code = 'whatsapp_channel' and is_active = true limit 1
  `);
  if (feat.rows[0]) {
    await client.query(
      `select public.set_company_feature_grant($1, $2, true, 'trial', now(), now() + interval '14 days', 'phase6-test')`,
      [pendingId, feat.rows[0].code],
    );
  }

  const wa = await client.query(`select public.is_feature_enabled($1, 'whatsapp_channel') as e`, [pendingId]);
  assert.equal(wa.rows[0].e, false);
  console.log("  ✓ pending + whatsapp grant → DENY");

  const core = await client.query(`select public.is_feature_enabled($1, 'core_crm') as e`, [pendingId]);
  assert.equal(core.rows[0].e, true);
  console.log("  ✓ pending + core_crm → ALLOW");

  const access = await client.query(`select public.get_company_access_state($1) as s`, [pendingId]);
  assert.equal(access.rows[0].s, "expired");
  console.log("  ✓ pending access state → expired");

  await client.query(`update public.companies set approval_status = 'rejected' where id = $1`, [pendingId]);
  const wa2 = await client.query(`select public.is_feature_enabled($1, 'whatsapp_channel') as e`, [pendingId]);
  assert.equal(wa2.rows[0].e, false);
  console.log("  ✓ rejected + whatsapp → DENY");

  await client.query(`select public.approve_company_v1($1, 'trial', 'phase6')`, [pendingId]);
  const wa3 = await client.query(`select public.is_feature_enabled($1, 'whatsapp_channel') as e`, [pendingId]);
  console.log("  ✓ approved company evaluates entitlement normally (whatsapp=", wa3.rows[0].e, ")");

  const customers = await client.query(`select public.is_feature_enabled($1, 'customers') as e`, [pendingId]);
  assert.equal(customers.rows[0].e, true);
  console.log("  ✓ customers intact after approve");

  await client.query("rollback");
  console.log("\nPhase 6 live verification passed\n");
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
