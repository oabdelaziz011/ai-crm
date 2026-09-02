/**
 * Dashboard route registry — RBAC ∧ commercial entitlement enforcement.
 * Run: npx tsx scripts/dashboard-route-commercial-enforcement.test.mts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DASHBOARD_ROUTE_REGISTRY,
  getDashboardRouteById,
  isDashboardRoutePermitted,
  type DashboardRouteDefinition,
} from "../src/config/dashboard-route-registry.ts";
import { BILLING_FEATURE_CODES } from "../src/lib/billing/feature-code-map.ts";

const BILLING_CODES = new Set<string>(BILLING_FEATURE_CODES);

/** Routes hardened in the global commercial entitlement audit (Phase B). */
const HARDENED_ROUTES: ReadonlyArray<{
  id: DashboardRouteDefinition["id"];
  permission: string;
  commercialFeatureCode: string;
}> = [
  { id: "products", permission: "products.view", commercialFeatureCode: "opportunities" },
  { id: "quotes", permission: "quotes.view", commercialFeatureCode: "opportunities" },
  { id: "executive", permission: "executive.view", commercialFeatureCode: "operations" },
  { id: "organization", permission: "organization.view", commercialFeatureCode: "operations" },
  { id: "marketplace", permission: "marketplace.view", commercialFeatureCode: "api_access" },
  { id: "knowledge", permission: "knowledge.view", commercialFeatureCode: "ai_employee" },
  { id: "prompts", permission: "prompts.view", commercialFeatureCode: "ai_employee" },
  { id: "financial", permission: "invoices.view", commercialFeatureCode: "finance" },
  { id: "ai-usage", permission: "ai.costs.view", commercialFeatureCode: "advanced_reports" },
  { id: "universal-operations", permission: "operations.read", commercialFeatureCode: "operations" },
];

function perms(...codes: string[]) {
  const set = new Set(codes);
  return (code: string) => set.has(code);
}

function entitled(...codes: string[]) {
  const set = new Set(codes);
  return (code: string) => set.has(code);
}

function platformEnabled() {
  return () => true;
}

function assertRouteMatrix(
  route: DashboardRouteDefinition,
  permission: string,
  commercialFeatureCode: string,
) {
  const hasRbac = perms(permission);
  const noRbac = perms();
  const withEntitlement = entitled(commercialFeatureCode);
  const noEntitlement = entitled();
  const loading = () => undefined as boolean | undefined;

  // RBAC YES + entitlement YES → ALLOW
  assert.equal(
    isDashboardRoutePermitted(route, false, hasRbac, platformEnabled(), withEntitlement),
    true,
    `${route.id}: RBAC+entitlement should allow`,
  );

  // RBAC YES + entitlement NO → DENY
  assert.equal(
    isDashboardRoutePermitted(route, false, hasRbac, platformEnabled(), noEntitlement),
    false,
    `${route.id}: RBAC without entitlement should deny`,
  );

  // RBAC NO + entitlement YES → DENY
  assert.equal(
    isDashboardRoutePermitted(route, false, noRbac, platformEnabled(), withEntitlement),
    false,
    `${route.id}: entitlement without RBAC should deny`,
  );

  // RBAC NO + entitlement NO → DENY
  assert.equal(
    isDashboardRoutePermitted(route, false, noRbac, platformEnabled(), noEntitlement),
    false,
    `${route.id}: neither RBAC nor entitlement should deny`,
  );

  // Fail-closed on loading/undefined entitlement
  assert.equal(
    isDashboardRoutePermitted(route, false, hasRbac, platformEnabled(), loading),
    false,
    `${route.id}: loading entitlement should deny`,
  );

  // Super-admin bypass
  assert.equal(
    isDashboardRoutePermitted(route, true, noRbac, platformEnabled(), noEntitlement),
    true,
    `${route.id}: super-admin should bypass`,
  );
}

describe("Dashboard route commercial enforcement", () => {
  it("maps each hardened route to existing billing catalog codes and permissions", () => {
    for (const expected of HARDENED_ROUTES) {
      const route = getDashboardRouteById(expected.id);
      assert.equal(route.permission, expected.permission, expected.id);
      assert.equal(route.commercialFeatureCode, expected.commercialFeatureCode, expected.id);
      assert.ok(
        BILLING_CODES.has(expected.commercialFeatureCode),
        `${expected.commercialFeatureCode} must exist in feature_definitions catalog`,
      );
    }
  });

  for (const expected of HARDENED_ROUTES) {
    it(`${expected.id}: RBAC ∧ commercial matrix`, () => {
      assertRouteMatrix(getDashboardRouteById(expected.id), expected.permission, expected.commercialFeatureCode);
    });
  }

  it("keeps core customers route without commercial gate", () => {
    const customers = getDashboardRouteById("customers");
    assert.equal(customers.commercialFeatureCode, undefined);
    assert.equal(
      isDashboardRoutePermitted(customers, false, perms("customers.view"), platformEnabled(), () => false),
      true,
    );
  });

  it("campaigns require campaigns commercial entitlement", () => {
    const campaigns = getDashboardRouteById("campaigns");
    assert.equal(campaigns.permission, "campaigns.view");
    assert.equal(campaigns.commercialFeatureCode, "campaigns");
    assert.equal(
      isDashboardRoutePermitted(campaigns, false, perms("campaigns.view"), platformEnabled(), entitled("campaigns")),
      true,
    );
    assert.equal(
      isDashboardRoutePermitted(campaigns, false, perms("campaigns.view"), platformEnabled(), entitled()),
      false,
    );
  });

  it("every commercialFeatureCode on dashboard routes uses a catalog code", () => {
    for (const route of DASHBOARD_ROUTE_REGISTRY) {
      if (!route.commercialFeatureCode) continue;
      assert.ok(
        BILLING_CODES.has(route.commercialFeatureCode),
        `${route.id} → ${route.commercialFeatureCode}`,
      );
    }
  });

  it("no audited commercial route remains without commercialFeatureCode", () => {
    const ids = HARDENED_ROUTES.map((r) => r.id);
    for (const id of ids) {
      const route = getDashboardRouteById(id);
      assert.ok(route.commercialFeatureCode, `${id} must have commercialFeatureCode`);
    }
  });

  it("commercial routes with permissions require both gates (integrations control)", () => {
    const integrations = getDashboardRouteById("integrations");
    assert.equal(integrations.commercialFeatureCode, "api_access");
    assert.equal(
      isDashboardRoutePermitted(integrations, false, perms("integrations.view"), platformEnabled(), entitled("api_access")),
      true,
    );
    assert.equal(
      isDashboardRoutePermitted(integrations, false, perms("integrations.view"), platformEnabled(), entitled()),
      false,
    );
  });
});
