import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGuidePermissionSnapshot,
  evaluateGuideRouteAccess,
  evaluateGuideTaskAccess,
  listPermittedGuideRouteIds,
  type GuideEffectiveAuth,
} from "./guide-auth";

function auth(overrides: Partial<GuideEffectiveAuth> = {}): GuideEffectiveAuth {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    permissionCodes: [],
    permissionsAvailable: true,
    ...overrides,
  };
}

describe("Phase 1B permission-aware Guide auth", () => {
  it("allows view-only customer guidance navigation to customers with customers.view", () => {
    const decision = evaluateGuideTaskAccess(auth({ permissionCodes: ["customers.view"] }), "customers.view");
    assert.equal(decision.allowed, true);
    const create = evaluateGuideTaskAccess(auth({ permissionCodes: ["customers.view"] }), "customers.create");
    assert.equal(create.allowed, false);
    assert.deepEqual(create.missing, ["customers.create"]);
  });

  it("allows create when view + create are present", () => {
    const decision = evaluateGuideTaskAccess(
      auth({ permissionCodes: ["customers.view", "customers.create"] }),
      "customers.create",
    );
    assert.equal(decision.allowed, true);
  });

  it("denies customer module navigation without customers.view", () => {
    const route = evaluateGuideRouteAccess(auth({ permissionCodes: ["tickets.view"] }), "customers");
    assert.equal(route.allowed, false);
  });

  it("allows edit without delete, and denies delete", () => {
    const codes = ["customers.view", "customers.edit"];
    assert.equal(evaluateGuideTaskAccess(auth({ permissionCodes: codes }), "customers.edit").allowed, true);
    assert.equal(evaluateGuideTaskAccess(auth({ permissionCodes: codes }), "customers.delete").allowed, false);
  });

  it("fail-closes when permission context is unavailable", () => {
    const decision = evaluateGuideTaskAccess(
      auth({ permissionsAvailable: false, permissionCodes: ["customers.view", "customers.create"] }),
      "customers.create",
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "missing_context");
    assert.deepEqual(listPermittedGuideRouteIds(auth({ permissionsAvailable: false })), []);
  });

  it("denies route access when userId is missing despite available permissions", () => {
    const decision = evaluateGuideRouteAccess(
      auth({ userId: null, permissionCodes: ["customers.view"] }),
      "customers",
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "missing_context");
  });

  it("denies route access when companyId is missing despite available permissions", () => {
    const decision = evaluateGuideRouteAccess(
      auth({ companyId: null, permissionCodes: ["customers.view"] }),
      "customers",
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "missing_context");
  });

  it("denies route access for blank or whitespace-only identity or company ids", () => {
    const blankUser = evaluateGuideRouteAccess(
      auth({ userId: "   ", permissionCodes: ["customers.view"] }),
      "customers",
    );
    const blankCompany = evaluateGuideRouteAccess(
      auth({ companyId: "", permissionCodes: ["customers.view"] }),
      "customers",
    );
    assert.equal(blankUser.allowed, false);
    assert.equal(blankUser.reason, "missing_context");
    assert.equal(blankCompany.allowed, false);
    assert.equal(blankCompany.reason, "missing_context");
  });

  it("denies task access when identity or company context is missing", () => {
    const missingUser = evaluateGuideTaskAccess(
      auth({ userId: null, permissionCodes: ["customers.view"] }),
      "customers.view",
    );
    const missingCompany = evaluateGuideTaskAccess(
      auth({ companyId: null, permissionCodes: ["customers.view", "customers.create"] }),
      "customers.create",
    );
    const whitespaceIds = evaluateGuideTaskAccess(
      auth({ userId: " ", companyId: "\t", permissionCodes: ["customers.view"] }),
      "customers.view",
    );
    assert.equal(missingUser.allowed, false);
    assert.equal(missingUser.reason, "missing_context");
    assert.equal(missingCompany.allowed, false);
    assert.equal(missingCompany.reason, "missing_context");
    assert.equal(whitespaceIds.allowed, false);
    assert.equal(whitespaceIds.reason, "missing_context");
  });

  it("rebuilds permitted routes when permission codes change (no stale snapshot)", () => {
    const before = buildGuidePermissionSnapshot(auth({ permissionCodes: ["customers.view"] }));
    assert.equal(before.permittedRouteIds.includes("customers"), true);
    assert.equal(before.permittedRouteIds.includes("users"), false);

    const after = buildGuidePermissionSnapshot(
      auth({ permissionCodes: ["customers.view", "users.view"] }),
    );
    assert.equal(after.permittedRouteIds.includes("users"), true);
    assert.notDeepEqual(before.permissionCodes, after.permissionCodes);
  });

  it("fail-closes commercial routes when entitlement lookup is unavailable", () => {
    const decision = evaluateGuideRouteAccess(auth({ permissionCodes: ["whatsapp.view"] }), "whatsapp");
    assert.equal(decision.allowed, false);

    const entitled = evaluateGuideRouteAccess(
      auth({
        permissionCodes: ["whatsapp.view"],
        commercialFeatureEnabled: (code) => code === "whatsapp_channel",
      }),
      "whatsapp",
    );
    assert.equal(entitled.allowed, true);
  });

  it("keeps company context fields in the snapshot for tenant isolation checks", () => {
    const snap = buildGuidePermissionSnapshot(
      auth({ companyId: "co-a", userId: "u-a", permissionCodes: ["tickets.view"] }),
    );
    assert.equal(snap.companyId, "co-a");
    assert.equal(snap.userId, "u-a");
  });

  it("super admin is permitted for restricted routes", () => {
    const decision = evaluateGuideRouteAccess(auth({ isSuperAdmin: true, permissionCodes: [] }), "roles");
    assert.equal(decision.allowed, true);
  });
});
