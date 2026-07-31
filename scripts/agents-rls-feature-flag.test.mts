/**
 * Sprint 6.2.4 — Agents RLS feature-flag enforcement (static + logic regression).
 * Mirrors SQL helpers: company_has_permission, platform_ai_feature_enabled, company_has_agents_access.
 * Run: tsx scripts/agents-rls-feature-flag.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function read(rel: string) {
  return readFileSync(resolve(root, rel), "utf8");
}

/** Mirrors public.company_has_permission (113_rbac_rls_completion.sql). */
function companyHasPermission(input: {
  isSuperAdmin: boolean;
  tenantMatch: boolean;
  hasPermission: boolean;
}): boolean {
  return input.isSuperAdmin || (input.tenantMatch && input.hasPermission);
}

/** Mirrors public.platform_ai_feature_enabled (171_platform_ai_provider.sql). */
function platformAiFeatureEnabled(input: {
  isSuperAdmin: boolean;
  featureRowEnabled: boolean | null;
}): boolean {
  return input.isSuperAdmin || (input.featureRowEnabled ?? true);
}

/** Mirrors public.company_has_agents_access (198_agents_feature_rls_sprint6_2_4.sql). */
function companyHasAgentsAccess(input: {
  isSuperAdmin: boolean;
  tenantMatch: boolean;
  hasPermission: boolean;
  featureRowEnabled: boolean | null;
}): boolean {
  return (
    companyHasPermission(input) &&
    platformAiFeatureEnabled({
      isSuperAdmin: input.isSuperAdmin,
      featureRowEnabled: input.featureRowEnabled,
    })
  );
}

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    throw error;
  }
}

const migration = read("supabase/migrations/198_agents_feature_rls_sprint6_2_4.sql");

test("migration defines company_has_agents_access composite helper", () => {
  assert.match(migration, /create or replace function public\.company_has_agents_access/);
  assert.match(migration, /company_has_permission\(p_company_id, p_permission\)/);
  assert.match(migration, /platform_ai_feature_enabled\(p_company_id, 'ai_agents'\)/);
});

const agentPolicyNames = [
  "agent_workflows_select",
  "agent_workflows_insert",
  "agent_workflows_update",
  "agent_workflows_delete",
  "agent_workflow_checkpoints_select",
  "agent_workflow_checkpoints_insert",
  "agent_workflow_events_select",
  "agent_workflow_events_insert",
];

for (const policy of agentPolicyNames) {
  test(`policy ${policy} uses company_has_agents_access`, () => {
    const block = migration.slice(migration.indexOf(`create policy ${policy}`));
    assert.match(block, /company_has_agents_access\(company_id,/);
    assert.doesNotMatch(block.split(";")[0] ?? block, /company_has_permission\(company_id,/);
  });
}

test("permission split preserved in RLS policies", () => {
  assert.match(migration, /company_has_agents_access\(company_id, 'agents\.view'\)/);
  assert.match(migration, /company_has_agents_access\(company_id, 'agents\.execute'\)/);
  assert.match(migration, /company_has_agents_access\(company_id, 'agents\.manage'\)/);
});

test("feature ON + permission granted → access allowed", () => {
  assert.equal(
    companyHasAgentsAccess({
      isSuperAdmin: false,
      tenantMatch: true,
      hasPermission: true,
      featureRowEnabled: true,
    }),
    true,
  );
});

test("feature OFF + permission granted → access denied", () => {
  assert.equal(
    companyHasAgentsAccess({
      isSuperAdmin: false,
      tenantMatch: true,
      hasPermission: true,
      featureRowEnabled: false,
    }),
    false,
  );
});

test("feature ON + permission missing → access denied", () => {
  assert.equal(
    companyHasAgentsAccess({
      isSuperAdmin: false,
      tenantMatch: true,
      hasPermission: false,
      featureRowEnabled: true,
    }),
    false,
  );
});

test("super-admin bypasses feature OFF and missing permission", () => {
  assert.equal(
    companyHasAgentsAccess({
      isSuperAdmin: true,
      tenantMatch: false,
      hasPermission: false,
      featureRowEnabled: false,
    }),
    true,
  );
});

test("tenant isolation preserved when permission granted but tenant mismatched", () => {
  assert.equal(
    companyHasAgentsAccess({
      isSuperAdmin: false,
      tenantMatch: false,
      hasPermission: true,
      featureRowEnabled: true,
    }),
    false,
  );
});

test("missing feature row coalesces to enabled (matches runtime existing-tenant semantics)", () => {
  assert.equal(
    companyHasAgentsAccess({
      isSuperAdmin: false,
      tenantMatch: true,
      hasPermission: true,
      featureRowEnabled: null,
    }),
    true,
  );
});

console.log("\nAll agents RLS feature-flag tests passed.");
