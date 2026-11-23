import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DASHBOARD_ROUTE_REGISTRY } from "@/config/dashboard-route-registry";
import {
  assertGuideCatalogRoutesExist,
  findGuidePageByRouteId,
  getGuideModule,
  listGuideModules,
  resolveGuideModuleForRoute,
} from "./product-knowledge";
import { GUIDE_TASK_PERMISSIONS, listGuideTaskIds } from "./permission-matrix";

describe("Phase 1A product knowledge catalog", () => {
  it("only references routes that exist in DASHBOARD_ROUTE_REGISTRY", () => {
    assert.deepEqual(assertGuideCatalogRoutesExist(), []);
  });

  it("identifies customers module and page from registry metadata", () => {
    const mod = getGuideModule("customers");
    assert.ok(mod);
    assert.equal(mod.pages[0]?.routeId, "customers");
    assert.equal(mod.pages[0]?.nestedPath, "/customers");
    assert.equal(mod.pages[0]?.routePermission, "customers.view");
    assert.ok(mod.tasks.includes("customers.create"));
  });

  it("resolves module for known route ids only", () => {
    assert.equal(resolveGuideModuleForRoute("whatsapp")?.id, "whatsapp");
    assert.equal(resolveGuideModuleForRoute("not-a-real-route"), null);
  });

  it("does not invent features outside the catalog", () => {
    const ids = new Set(listGuideModules().map((m) => m.id));
    assert.equal(ids.has("customers"), true);
    assert.equal(ids.has("telepathy"), false);
    const knownRoutes = new Set(DASHBOARD_ROUTE_REGISTRY.map((r) => r.id));
    for (const mod of listGuideModules()) {
      for (const page of mod.pages) {
        assert.equal(knownRoutes.has(page.routeId), true, page.routeId);
      }
    }
  });

  it("maps tasks to real permission catalog codes (no invented codes)", () => {
    for (const taskId of listGuideTaskIds()) {
      const req = GUIDE_TASK_PERMISSIONS[taskId];
      for (const code of req.allOf) {
        assert.match(code, /^[a-z0-9_]+(\.[a-z0-9_]+)+$/i);
        assert.doesNotMatch(code, /invented|fake|todo/i);
      }
    }
    assert.deepEqual(GUIDE_TASK_PERMISSIONS["customers.create"].allOf, [
      "customers.view",
      "customers.create",
    ]);
    assert.equal(GUIDE_TASK_PERMISSIONS["customers.edit"].allOf.includes("customers.update"), false);
  });

  it("finds pages by route id", () => {
    const hit = findGuidePageByRouteId("tickets");
    assert.equal(hit?.module.id, "tickets");
    assert.equal(hit?.page.titleKey, "navigation.tickets");
  });
});
