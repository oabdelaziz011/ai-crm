import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findMissingAlignedPermission,
  getAlignedCrmToolRequirements,
  hasAlignedPermission,
} from "./crm-tool-permissions.js";

describe("crm-tool-permissions", () => {
  it("maps CRM tool requirements to RLS-aligned codes", () => {
    assert.deepEqual(getAlignedCrmToolRequirements("update_customer"), [
      "tools.execute",
      "customers.edit",
    ]);
    assert.deepEqual(getAlignedCrmToolRequirements("merge_customers"), [
      "tools.execute",
      "customers.edit",
      "customers.delete",
    ]);
  });

  it("accepts legacy customers.search alias for customers.view", () => {
    const ctx = {
      isSuperAdmin: false,
      hasPermission: (code: string) => code === "tools.execute" || code === "customers.search",
    };

    assert.equal(hasAlignedPermission(ctx, "customers.view"), true);
    assert.equal(findMissingAlignedPermission(ctx, ["tools.execute", "customers.view"]), null);
  });

  it("accepts legacy customers.update alias for customers.edit", () => {
    const ctx = {
      isSuperAdmin: false,
      hasPermission: (code: string) => code === "tools.execute" || code === "customers.update",
    };

    assert.equal(findMissingAlignedPermission(ctx, ["tools.execute", "customers.edit"], "update_customer"), null);
  });

  it("accepts legacy customers.merge bundle for merge_customers", () => {
    const ctx = {
      isSuperAdmin: false,
      hasPermission: (code: string) => code === "tools.execute" || code === "customers.merge",
    };

    assert.equal(
      findMissingAlignedPermission(
        ctx,
        ["tools.execute", "customers.edit", "customers.delete"],
        "merge_customers",
      ),
      null,
    );
  });

  it("reports missing RLS permission when no alias is held", () => {
    const ctx = {
      isSuperAdmin: false,
      hasPermission: (code: string) => code === "tools.execute",
    };

    assert.equal(
      findMissingAlignedPermission(ctx, ["tools.execute", "customers.edit"], "update_customer"),
      "customers.edit",
    );
  });
});
