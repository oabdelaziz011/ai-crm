/**
 * Company Feature Runtime Authorization — focused security tests.
 * Run: pnpm exec tsx --test scripts/company-feature-runtime-auth.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  CompanyPermissionDeniedError,
  createCompanyPermissionChecker,
  createPermissionAvailabilityChecker,
  hasCompanyPermission,
  requireCompanyPermission,
} from "../src/lib/billing/company-permission-authorization.ts";
import {
  groupPermissionsByFeature,
  isPermissionAvailableForCompany,
} from "../src/lib/billing/feature-definition-permissions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "../../..");
const migration297 = readFileSync(
  resolve(projectRoot, "supabase/migrations/297_rbac_permission_delegation_guard.sql"),
  "utf8",
);
const migration299 = readFileSync(
  resolve(projectRoot, "supabase/migrations/299_feature_definition_permissions.sql"),
  "utf8",
);
const migration300 = readFileSync(
  resolve(projectRoot, "supabase/migrations/300_has_company_permission.sql"),
  "utf8",
);
const setGrantRpc = readFileSync(
  resolve(projectRoot, "supabase/migrations/263_company_commercial_entitlements_foundation.sql"),
  "utf8",
);
const authHelper = readFileSync(
  resolve(here, "../src/lib/billing/company-permission-authorization.ts"),
  "utf8",
);
const useRbac = readFileSync(resolve(here, "../src/hooks/use-rbac.ts"), "utf8");
const leadCommands = readFileSync(
  resolve(here, "../src/hooks/leads/use-lead-commands.ts"),
  "utf8",
);

const sampleRows = [
  { feature_code: "leads", permission_code: "leads.view" },
  { feature_code: "leads", permission_code: "leads.create" },
  { feature_code: "customers", permission_code: "customers.view" },
  { feature_code: "customers", permission_code: "customers.create" },
];

function makeAuth(input: {
  rbac: string[];
  enabledFeatures: string[];
  isSuperAdmin?: boolean;
  isReady?: boolean;
}) {
  const map = groupPermissionsByFeature(sampleRows);
  const enabled = new Set(input.enabledFeatures);
  const isPermissionAvailable = createPermissionAvailabilityChecker({
    isSuperAdmin: Boolean(input.isSuperAdmin),
    isReady: input.isReady ?? true,
    featurePermissions: map,
    isFeatureEnabled: (c) => enabled.has(c),
  });
  const hasRbacPermission = (code: string) => input.rbac.includes(code);
  return {
    map,
    enabled,
    isPermissionAvailable,
    hasRbacPermission,
    checker: createCompanyPermissionChecker({
      isSuperAdmin: Boolean(input.isSuperAdmin),
      hasRbacPermission,
      isPermissionAvailable,
    }),
  };
}

describe("1 — Feature OFF + mapped permission held → runtime DENY", () => {
  it("denies leads.create when leads feature is disabled", () => {
    const auth = makeAuth({ rbac: ["leads.create", "leads.view"], enabledFeatures: ["customers"] });
    assert.equal(auth.checker("leads.create"), false);
    assert.equal(
      hasCompanyPermission("leads.create", {
        isSuperAdmin: false,
        hasRbacPermission: auth.hasRbacPermission,
        isPermissionAvailable: auth.isPermissionAvailable,
      }),
      false,
    );
  });
});

describe("2 — Feature ON + mapped permission held → runtime ALLOW", () => {
  it("allows leads.create when leads feature is enabled and RBAC holds it", () => {
    const auth = makeAuth({ rbac: ["leads.create"], enabledFeatures: ["leads"] });
    assert.equal(auth.checker("leads.create"), true);
  });
});

describe("3 — Feature ON + permission absent → DENY", () => {
  it("denies when RBAC lacks permission even if feature is on", () => {
    const auth = makeAuth({ rbac: ["leads.view"], enabledFeatures: ["leads"] });
    assert.equal(auth.checker("leads.create"), false);
  });
});

describe("4 — Feature OFF + permission absent → DENY", () => {
  it("denies when both RBAC and company availability fail", () => {
    const auth = makeAuth({ rbac: [], enabledFeatures: [] });
    assert.equal(auth.checker("leads.create"), false);
  });
});

describe("5 — Legacy stored permission is NOT deleted when feature is disabled", () => {
  it("RBAC primitive can still report held permission; product auth denies", () => {
    const auth = makeAuth({ rbac: ["leads.create"], enabledFeatures: [] });
    assert.equal(auth.hasRbacPermission("leads.create"), true);
    assert.equal(auth.checker("leads.create"), false);
    assert.doesNotMatch(migration300, /delete from public\.role_permissions/i);
    assert.doesNotMatch(migration300, /delete from public\.user_permissions/i);
    assert.doesNotMatch(authHelper, /delete from/i);
  });
});

describe("6 — Re-enable feature makes existing RBAC permission effective again", () => {
  it("same RBAC set becomes ALLOW after feature re-enabled", () => {
    const rbac = ["leads.create"];
    const off = makeAuth({ rbac, enabledFeatures: [] });
    assert.equal(off.checker("leads.create"), false);
    const on = makeAuth({ rbac, enabledFeatures: ["leads"] });
    assert.equal(on.checker("leads.create"), true);
  });
});

describe("7 — Company Admin cannot change company feature", () => {
  it("set_company_feature_grant requires is_super_admin", () => {
    assert.match(setGrantRpc, /create or replace function public\.set_company_feature_grant/);
    assert.match(
      setGrantRpc,
      /if auth\.role\(\) <> 'service_role' and not public\.is_super_admin\(\) then/,
    );
  });
});

describe("8 — Super Admin can change company feature", () => {
  it("super admin bypasses product permission gate; grant RPC allows is_super_admin", () => {
    const auth = makeAuth({
      rbac: [],
      enabledFeatures: [],
      isSuperAdmin: true,
    });
    assert.equal(auth.checker("leads.create"), true);
    assert.match(setGrantRpc, /not public\.is_super_admin\(\)/);
  });
});

describe("9 — Cross-company denial", () => {
  it("uuid overload of has_company_permission requires current_company_id match", () => {
    assert.match(migration300, /p_company_id = public\.current_company_id\(\)/);
    assert.match(migration300, /has_company_permission\(\s*p_company_id uuid/);
  });
});

describe("10 — Migration 297 delegation guard remains intact", () => {
  it("297 file still enforces role_delegation_denied and actor_can_delegate", () => {
    assert.match(migration297, /role_delegation_denied/);
    assert.match(migration297, /actor_can_delegate_permission/);
    assert.match(migration297, /actor_can_delegate_role/);
  });
});

describe("Architecture invariants", () => {
  it("user_has_permission remains RBAC-only (not modified by 300)", () => {
    assert.doesNotMatch(migration300, /create or replace function public\.user_has_permission/);
    assert.match(migration300, /public\.user_has_permission\(p_code\)/);
    assert.match(migration300, /permission_available_to_company/);
  });

  it("usePermissions hasPermission stays RBAC-only (no company feature AND)", () => {
    assert.match(useRbac, /return isSuperAdmin \|\| permissions\.some/);
    assert.doesNotMatch(useRbac, /isPermissionAvailableForCompany/);
    assert.doesNotMatch(useRbac, /hasCompanyPermission/);
  });

  it("lead commands use company permission product boundary", () => {
    assert.match(leadCommands, /useCompanyPermissionAuth/);
    assert.match(leadCommands, /hasCompanyPermission/);
  });

  it("299 zero-mapping features are not invented in 300", () => {
    for (const code of [
      "ai_email_routing",
      "ai_ticketing",
      "ai_suggested_replies",
      "facebook_channel",
      "instagram_channel",
      "email_channel",
      "sms_channel",
    ]) {
      assert.doesNotMatch(migration300, new RegExp(code));
    }
    // Still documented as zero-map in 299 catalog comments / seeds absence
    assert.match(migration299, /feature_definition_permissions/);
  });

  it("requireCompanyPermission throws CompanyPermissionDeniedError", () => {
    const auth = makeAuth({ rbac: ["leads.create"], enabledFeatures: [] });
    assert.throws(
      () =>
        requireCompanyPermission("leads.create", {
          isSuperAdmin: false,
          hasRbacPermission: auth.hasRbacPermission,
          isPermissionAvailable: auth.isPermissionAvailable,
        }),
      (err: unknown) =>
        err instanceof CompanyPermissionDeniedError && err.permissionCode === "leads.create",
    );
  });

  it("fail-closed while availability not ready", () => {
    const auth = makeAuth({
      rbac: ["leads.create"],
      enabledFeatures: ["leads"],
      isReady: false,
    });
    assert.equal(auth.checker("leads.create"), false);
  });

  it("unmapped permission remains RBAC-only (availability fail-open)", () => {
    const map = groupPermissionsByFeature(sampleRows);
    assert.equal(
      isPermissionAvailableForCompany("settings.view", {
        isSuperAdmin: false,
        featurePermissions: map,
        isFeatureEnabled: () => false,
      }),
      true,
    );
    assert.equal(
      hasCompanyPermission("settings.view", {
        isSuperAdmin: false,
        hasRbacPermission: (c) => c === "settings.view",
        isPermissionAvailable: (c) =>
          isPermissionAvailableForCompany(c, {
            isSuperAdmin: false,
            featurePermissions: map,
            isFeatureEnabled: () => false,
          }),
      }),
      true,
    );
  });
});
