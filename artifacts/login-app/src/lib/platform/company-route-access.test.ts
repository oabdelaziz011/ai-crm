import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getDashboardRouteById,
  isDashboardRoutePermitted,
} from "../../config/dashboard-route-registry.ts";

describe("platform company route", () => {
  it("is platform-only for a super admin", () => {
    const route = getDashboardRouteById("companies");
    assert.equal(route.superAdminOnly, true);
    assert.equal(isDashboardRoutePermitted(route, true, () => false), true);
    assert.equal(isDashboardRoutePermitted(route, false, () => true), false);
  });
});
