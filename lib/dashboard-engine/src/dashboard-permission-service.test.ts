import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DashboardAccessRequiredError,
  DashboardAuthenticationError,
  dashboardPermissionService,
  DASHBOARD_VIEW_PERMISSION,
  type DashboardAccess,
} from "./index.js";

describe("DashboardPermissionService", () => {
  const access: DashboardAccess = {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) => code === DASHBOARD_VIEW_PERMISSION,
  };

  it("requires authenticated access", () => {
    assert.throws(
      () => dashboardPermissionService.assertDashboardReadAccess(undefined as never, { companyId: "company-1" }),
      DashboardAccessRequiredError,
    );
  });

  it("requires company on access context", () => {
    assert.throws(
      () =>
        dashboardPermissionService.assertDashboardReadAccess(
          { ...access, companyId: "" },
          { companyId: "company-1" },
        ),
      DashboardAuthenticationError,
    );
  });

  it("allows super-admin cross-tenant reads", () => {
    assert.doesNotThrow(() =>
      dashboardPermissionService.assertDashboardReadAccess(
        { ...access, isSuperAdmin: true, companyId: "company-2" },
        { companyId: "company-1" },
      ),
    );
  });
});
