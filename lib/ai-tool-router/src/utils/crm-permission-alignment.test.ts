import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findMissingAlignedPermission, hasAlignedPermission } from "@workspace/agent-runtime";

describe("crm-permission-alignment", () => {
  it("accepts legacy customers.search alias for customers.view", () => {
    const ctx = {
      isSuperAdmin: false,
      hasPermission: (code: string) => code === "tools.execute" || code === "customers.search",
    };

    assert.equal(findMissingAlignedPermission(ctx, ["tools.execute", "customers.view"]), null);
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

  it("reports missing permission when no alias is held", () => {
    const ctx = {
      isSuperAdmin: false,
      hasPermission: (code: string) => code === "tools.execute",
    };

    assert.equal(
      findMissingAlignedPermission(ctx, ["tools.execute", "customers.edit"], "update_customer"),
      "customers.edit",
    );
    assert.equal(hasAlignedPermission(ctx, "customers.edit"), false);
  });
});
