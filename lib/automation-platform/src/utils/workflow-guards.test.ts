import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorkflowFeatureDisabledError, PermissionDeniedError } from "../errors.js";
import {
  assertWorkflowExecutionAllowed,
  assertWorkflowFeatureEnabled,
  assertWorkflowTenantAccess,
} from "./workflow-guards.js";
import type { ServiceContext } from "../types.js";

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: () => true,
    ...overrides,
  };
}

describe("automation-platform workflow guards", () => {
  it("allows super-admin regardless of feature flag", () => {
    assert.doesNotThrow(() =>
      assertWorkflowFeatureEnabled(ctx({ isSuperAdmin: true, isWorkflowFeatureEnabled: () => false })),
    );
  });

  it("blocks when workflow feature is disabled", () => {
    assert.throws(
      () => assertWorkflowFeatureEnabled(ctx({ isWorkflowFeatureEnabled: () => false })),
      WorkflowFeatureDisabledError,
    );
  });

  it("allows when workflow feature is enabled", () => {
    assert.doesNotThrow(() =>
      assertWorkflowFeatureEnabled(ctx({ isWorkflowFeatureEnabled: () => true })),
    );
  });

  it("allows missing feature resolver (runtime missing-row semantics)", () => {
    assert.doesNotThrow(() => assertWorkflowFeatureEnabled(ctx()));
  });

  it("requires RBAC for tenant access", () => {
    assert.throws(
      () =>
        assertWorkflowTenantAccess(
          ctx({ hasPermission: () => false }),
          "company-1",
          "automation.create",
        ),
      PermissionDeniedError,
    );
  });

  it("allows execution when automation feature enabled", () => {
    assert.doesNotThrow(() =>
      assertWorkflowExecutionAllowed(ctx({ isWorkflowFeatureEnabled: () => true })),
    );
  });
});
