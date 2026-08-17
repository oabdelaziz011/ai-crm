/**
 * RLS Company Feature Enforcement — focused security tests.
 * Run: pnpm exec tsx --test scripts/rls-company-feature-enforcement.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "../../..");
const migration300 = readFileSync(
  resolve(projectRoot, "supabase/migrations/300_has_company_permission.sql"),
  "utf8",
);
const migration301 = readFileSync(
  resolve(projectRoot, "supabase/migrations/301_rls_company_feature_enforcement.sql"),
  "utf8",
);
const migration297 = readFileSync(
  resolve(projectRoot, "supabase/migrations/297_rbac_permission_delegation_guard.sql"),
  "utf8",
);
const migration299 = readFileSync(
  resolve(projectRoot, "supabase/migrations/299_feature_definition_permissions.sql"),
  "utf8",
);

describe("1 — Feature OFF + mapped permission held → RLS helper DENIES", () => {
  it("company_has_permission requires permission_available_to_company", () => {
    assert.match(migration301, /permission_available_to_company\(p_company_id, p_permission\)/);
    assert.match(migration301, /user_has_permission\(p_permission\)/);
  });
});

describe("2 — Feature ON + permission held → ALLOW path preserved", () => {
  it("helper still ANDs RBAC when availability passes", () => {
    assert.match(
      migration301,
      /user_has_permission\(p_permission\)\s*\n\s*and public\.permission_available_to_company/,
    );
  });
});

describe("3/4 — Missing permission still denies", () => {
  it("RBAC check remains required in company_has_permission", () => {
    assert.match(migration301, /public\.user_has_permission\(p_permission\)/);
  });
});

describe("5 — Cross-company access denied", () => {
  it("company_id must equal current_company_id", () => {
    assert.match(migration301, /p_company_id = public\.current_company_id\(\)/);
    assert.match(migration300, /p_company_id = public\.current_company_id\(\)/);
  });
});

describe("6 — Super Admin behavior preserved", () => {
  it("is_super_admin short-circuits company_has_permission and has_company_permission", () => {
    assert.match(migration301, /public\.is_super_admin\(\)/);
    assert.match(migration300, /public\.is_super_admin\(\)/);
  });
});

describe("7 — Service-role behavior preserved", () => {
  it("company_has_permission still requires auth.role authenticated (service_role bypasses RLS)", () => {
    assert.match(migration301, /auth\.role\(\) = 'authenticated'/);
    assert.match(migration301, /grant execute on function .*company_has_permission.*service_role/);
  });
});

describe("8 — Legacy stored role permissions are NOT deleted", () => {
  it("301 does not delete role_permissions / user_permissions / user_roles", () => {
    assert.doesNotMatch(migration301, /delete from public\.role_permissions/i);
    assert.doesNotMatch(migration301, /delete from public\.user_permissions/i);
    assert.doesNotMatch(migration301, /delete from public\.user_roles/i);
  });
});

describe("Architecture — user_has_permission unchanged", () => {
  it("does not replace user_has_permission definition", () => {
    assert.doesNotMatch(migration301, /create or replace function public\.user_has_permission/);
    assert.doesNotMatch(migration301, /create or replace function internal\.user_has_permission/);
    assert.doesNotMatch(migration300, /create or replace function public\.user_has_permission/);
  });
});

describe("Category A policy rewrites", () => {
  it("scheduling/bookings/customers product policies use has_company_permission", () => {
    assert.match(migration301, /scheduling_bookings_insert[\s\S]*has_company_permission\('bookings\.create'/);
    assert.match(migration301, /scheduling_bookings_select[\s\S]*has_company_permission\('bookings\.view'/);
    assert.match(migration301, /customer_comm_prefs_write[\s\S]*has_company_permission\('customers\.edit'/);
    assert.match(migration301, /branches_delete[\s\S]*has_company_permission\('scheduling\.edit'/);
  });

  it("users.edit remains RBAC-only on user_branch_assignments", () => {
    assert.match(
      migration301,
      /user_branch_assignments_delete[\s\S]*user_has_permission\('users\.edit'[\s\S]*has_company_permission\('scheduling\.edit'/,
    );
  });
});

describe("Zero-mapping / core_crm / prior migrations intact", () => {
  it("does not invent zero-mapping features or alter 299 mappings", () => {
    for (const code of [
      "ai_email_routing",
      "ai_ticketing",
      "ai_suggested_replies",
      "facebook_channel",
      "instagram_channel",
      "email_channel",
      "sms_channel",
    ]) {
      assert.doesNotMatch(migration301, new RegExp(code));
    }
    assert.doesNotMatch(migration301, /insert into public\.feature_definition_permissions/i);
  });

  it("297 delegation guard file still present", () => {
    assert.match(migration297, /role_delegation_denied/);
  });

  it("299 mapping table still present", () => {
    assert.match(migration299, /feature_definition_permissions/);
  });
});

describe("Anon execute revoked", () => {
  it("revokes has_company_permission from anon/public", () => {
    assert.match(migration301, /revoke all on function public\.has_company_permission\(text\) from anon/);
    assert.match(migration301, /revoke all on function public\.has_company_permission\(uuid, text\) from anon/);
  });
});
