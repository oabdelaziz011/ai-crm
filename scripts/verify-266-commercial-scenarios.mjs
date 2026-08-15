/**
 * Extended live Phase 6 commercial scenarios for browser-adjacent verification.
 * Run: node scripts/verify-266-commercial-scenarios.mjs
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
console.log("\nPhase 6 extended commercial scenarios\n");

async function feature(companyId, code) {
  const r = await client.query(`select public.is_feature_enabled($1, $2) as e`, [companyId, code]);
  return Boolean(r.rows[0].e);
}

try {
  await client.query("begin");
  await client.query("select set_config('vault.provisioning_bootstrap', 'true', true)");

  // Suspended + grant
  const sus = await client.query(`
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      'Phase6 Sus '||gen_random_uuid()::text,
      'Suspended', 'Pro', 'active', 'tenant',
      'approved', now(), 'completed'
    ) returning id
  `);
  const susId = sus.rows[0].id;
  await client.query(`select public._ensure_core_system_feature_grants($1)`, [susId]);
  await client.query(
    `select public.set_company_feature_grant($1, 'whatsapp_channel', true, 'manual', now(), null, 'phase6')`,
    [susId],
  );
  assert.equal(await feature(susId, "whatsapp_channel"), false);
  console.log("  ✓ suspended + whatsapp grant → DENY");

  // Approved trial pack then expire trial grant; manual survives
  const trial = await client.query(`
    insert into public.companies (
      name, status, subscription_plan, subscription_status, company_type,
      approval_status, approval_requested_at, tenant_provisioning_status
    ) values (
      'Phase6 Trial '||gen_random_uuid()::text,
      'Trial', 'Basic', 'trialing', 'tenant',
      'approved', now(), 'completed'
    ) returning id
  `);
  const trialId = trial.rows[0].id;
  await client.query(`select public.approve_company_v1($1, 'trial', 'phase6')`, [trialId]);

  // Ensure ticketing trial grant then expire it
  await client.query(
    `select public.set_company_feature_grant($1, 'ticketing', true, 'trial', now() - interval '20 days', now() - interval '1 day', 'phase6')`,
    [trialId],
  );
  assert.equal(await feature(trialId, "ticketing"), false);
  console.log("  ✓ expired trial ticketing → DENY");

  await client.query(
    `select public.set_company_feature_grant($1, 'ticketing', true, 'manual', now(), null, 'phase6')`,
    [trialId],
  );
  assert.equal(await feature(trialId, "ticketing"), true);
  console.log("  ✓ manual ticketing survives trial expiry → ALLOW");

  await client.query(
    `select public.set_company_feature_grant($1, 'whatsapp_channel', true, 'contract', now(), null, 'phase6')`,
    [trialId],
  );
  assert.equal(await feature(trialId, "whatsapp_channel"), true);
  assert.equal(await feature(trialId, "facebook_channel"), false);
  assert.equal(await feature(trialId, "instagram_channel"), false);
  assert.equal(await feature(trialId, "email_channel"), false);
  assert.equal(await feature(trialId, "sms_channel"), false);
  console.log("  ✓ WhatsApp only does not unlock other channels");

  assert.equal(await feature(trialId, "customers"), true);
  assert.equal(await feature(trialId, "core_crm"), true);
  console.log("  ✓ core CRM / customers intact");

  // require_company_feature_v1 raises when denied
  let raised = false;
  try {
    await client.query(`select public.require_company_feature_v1($1, 'facebook_channel')`, [trialId]);
  } catch {
    raised = true;
  }
  assert.equal(raised, true);
  console.log("  ✓ require_company_feature_v1 raises on deny (server gate)");

  await client.query("rollback");
  console.log("\nPhase 6 extended scenarios passed\n");
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
