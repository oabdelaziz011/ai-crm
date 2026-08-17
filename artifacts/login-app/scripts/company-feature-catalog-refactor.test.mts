/**
 * Company Feature catalog refactor (302) — focused verification tests.
 * Run: pnpm exec tsx --test scripts/company-feature-catalog-refactor.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { BILLING_FEATURE_CODES } from "../src/lib/billing/feature-code-map.ts";
import {
  filterCompanyFeatureEntitlementsForDisplay,
  resolveCompanyFeatureCatalogSection,
  sortCompanyFeatureEntitlements,
} from "../src/lib/billing/company-feature-catalog-display.ts";
import {
  hasCompanyPermission,
  createPermissionAvailabilityChecker,
} from "../src/lib/billing/company-permission-authorization.ts";
import { groupPermissionsByFeature } from "../src/lib/billing/feature-definition-permissions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "../../..");
const migration302 = readFileSync(
  resolve(projectRoot, "supabase/migrations/302_refactor_company_feature_catalog.sql"),
  "utf8",
);
const migration297 = readFileSync(
  resolve(projectRoot, "supabase/migrations/297_rbac_permission_delegation_guard.sql"),
  "utf8",
);
const dialog = readFileSync(
  resolve(here, "../src/components/companies/company-features-access-dialog.tsx"),
  "utf8",
);

describe("New feature definitions", () => {
  it("creates finance + platform admin groups", () => {
    for (const code of [
      "finance",
      "users_roles",
      "company_settings",
      "administration",
      "security_audit",
    ]) {
      assert.match(migration302, new RegExp(`'${code}'`));
      assert.ok((BILLING_FEATURE_CODES as readonly string[]).includes(code));
    }
  });

  it("marks finance commercial and platform groups non-billable", () => {
    assert.match(migration302, /'finance'[\s\S]*false, true, true/);
    assert.match(migration302, /'users_roles'[\s\S]*true, false, false/);
    assert.match(migration302, /'company_settings'[\s\S]*true, false, false/);
    assert.match(migration302, /'administration'[\s\S]*true, false, false/);
    assert.match(migration302, /'security_audit'[\s\S]*true, false, false/);
  });
});

describe("core_crm handling", () => {
  it("empties core_crm mappings and keeps legacy definition", () => {
    assert.match(migration302, /delete from public\.feature_definition_permissions\s+where feature_code = 'core_crm'/);
    assert.match(migration302, /CRM \(legacy\)/);
    assert.match(migration302, /core_crm still has/);
  });

  it("does not delete RBAC rows", () => {
    assert.doesNotMatch(migration302, /delete from public\.role_permissions/i);
    assert.doesNotMatch(migration302, /delete from public\.user_roles/i);
    assert.doesNotMatch(migration302, /delete from public\.user_permissions/i);
    assert.doesNotMatch(migration302, /delete from public\.permissions/i);
  });
});

describe("Compatibility", () => {
  it("backfills finance grants and plan_features from core_crm", () => {
    assert.match(migration302, /migration_302_core_crm_split/);
    assert.match(migration302, /insert into public\.plan_features/);
    assert.match(migration302, /insert into public\.company_feature_overrides/);
  });

  it("does not invent zero-mapping feature permission rows", () => {
    for (const code of [
      "ai_email_routing",
      "ai_ticketing",
      "ai_suggested_replies",
      "facebook_channel",
      "instagram_channel",
      "email_channel",
      "sms_channel",
    ]) {
      assert.doesNotMatch(
        migration302,
        new RegExp(`\\('${code}',\\s*'[^']+'\\)`),
      );
    }
  });
});

describe("UI catalog presentation", () => {
  it("dialog uses sectioned product/admin catalog helpers", () => {
    assert.match(dialog, /sortCompanyFeatureEntitlements/);
    assert.match(dialog, /filterCompanyFeatureEntitlementsForDisplay/);
    assert.match(dialog, /sectionAdministration/);
  });

  it("hides empty legacy core_crm from display list", () => {
    const rows = [
      { feature_code: "customers" },
      { feature_code: "core_crm" },
      { feature_code: "finance" },
    ];
    const map = new Map<string, string[]>([
      ["customers", ["customers.view"]],
      ["core_crm", []],
      ["finance", ["billing.view"]],
    ]);
    const visible = filterCompanyFeatureEntitlementsForDisplay(rows, map);
    assert.deepEqual(
      visible.map((r) => r.feature_code),
      ["customers", "finance"],
    );
    assert.equal(resolveCompanyFeatureCatalogSection("users_roles"), "administration");
    assert.equal(resolveCompanyFeatureCatalogSection("leads"), "product");
    const sorted = sortCompanyFeatureEntitlements([
      { feature_code: "security_audit" },
      { feature_code: "leads" },
      { feature_code: "finance" },
    ]);
    assert.deepEqual(
      sorted.map((r) => r.feature_code),
      ["leads", "finance", "security_audit"],
    );
  });
});

describe("Authorization compatibility (runtime helper)", () => {
  const rows = [
    { feature_code: "finance", permission_code: "billing.view" },
    { feature_code: "leads", permission_code: "leads.create" },
  ];
  const map = groupPermissionsByFeature(rows);

  it("feature OFF + stored permission → DENY", () => {
    const isPermissionAvailable = createPermissionAvailabilityChecker({
      isSuperAdmin: false,
      isReady: true,
      featurePermissions: map,
      isFeatureEnabled: () => false,
    });
    assert.equal(
      hasCompanyPermission("billing.view", {
        isSuperAdmin: false,
        hasRbacPermission: (c) => c === "billing.view",
        isPermissionAvailable,
      }),
      false,
    );
  });

  it("feature ON + stored permission → ALLOW", () => {
    const isPermissionAvailable = createPermissionAvailabilityChecker({
      isSuperAdmin: false,
      isReady: true,
      featurePermissions: map,
      isFeatureEnabled: (c) => c === "finance",
    });
    assert.equal(
      hasCompanyPermission("billing.view", {
        isSuperAdmin: false,
        hasRbacPermission: (c) => c === "billing.view",
        isPermissionAvailable,
      }),
      true,
    );
  });

  it("does not auto-grant missing RBAC permission", () => {
    const isPermissionAvailable = createPermissionAvailabilityChecker({
      isSuperAdmin: false,
      isReady: true,
      featurePermissions: map,
      isFeatureEnabled: () => true,
    });
    assert.equal(
      hasCompanyPermission("billing.view", {
        isSuperAdmin: false,
        hasRbacPermission: () => false,
        isPermissionAvailable,
      }),
      false,
    );
  });
});

describe("Prior guards intact", () => {
  it("297 delegation guard file still present", () => {
    assert.match(migration297, /role_delegation_denied/);
  });
});
