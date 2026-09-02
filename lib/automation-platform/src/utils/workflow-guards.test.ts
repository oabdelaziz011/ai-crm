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
  it("A workflow flag true → ALLOW", () => {
    assert.doesNotThrow(() =>
      assertWorkflowFeatureEnabled(ctx({ isWorkflowFeatureEnabled: () => true })),
    );
  });

  it("B workflow flag false → DENY", () => {
    assert.throws(
      () => assertWorkflowFeatureEnabled(ctx({ isWorkflowFeatureEnabled: () => false })),
      WorkflowFeatureDisabledError,
    );
  });

  it("E callback returns undefined → DENY", () => {
    assert.throws(
      () =>
        assertWorkflowFeatureEnabled(
          ctx({ isWorkflowFeatureEnabled: () => undefined as unknown as boolean }),
        ),
      WorkflowFeatureDisabledError,
    );
  });

  it("F callback throws → DENY", () => {
    assert.throws(
      () =>
        assertWorkflowFeatureEnabled(
          ctx({
            isWorkflowFeatureEnabled: () => {
              throw new Error("resolver failed");
            },
          }),
        ),
      WorkflowFeatureDisabledError,
    );
  });

  it("G automation callback missing → DENY", () => {
    assert.throws(() => assertWorkflowFeatureEnabled(ctx()), WorkflowFeatureDisabledError);
  });

  it("L missing company context → DENY", () => {
    assert.throws(
      () =>
        assertWorkflowFeatureEnabled(
          ctx({ companyId: null, isWorkflowFeatureEnabled: () => true }),
        ),
      WorkflowFeatureDisabledError,
    );
    assert.throws(
      () =>
        assertWorkflowFeatureEnabled(
          ctx({ companyId: "   ", isWorkflowFeatureEnabled: () => true }),
        ),
      WorkflowFeatureDisabledError,
    );
  });

  it("allows super-admin regardless of feature flag", () => {
    assert.doesNotThrow(() =>
      assertWorkflowFeatureEnabled(ctx({ isSuperAdmin: true, isWorkflowFeatureEnabled: () => false })),
    );
    assert.doesNotThrow(() => assertWorkflowFeatureEnabled(ctx({ isSuperAdmin: true })));
  });

  it("M existing RBAC denial remains DENY", () => {
    assert.throws(
      () =>
        assertWorkflowTenantAccess(
          ctx({ hasPermission: () => false, isWorkflowFeatureEnabled: () => true }),
          "company-1",
          "automation.create",
        ),
      PermissionDeniedError,
    );
  });

  it("N successful path remains ALLOW when all gates are true", () => {
    assert.doesNotThrow(() =>
      assertWorkflowExecutionAllowed(ctx({ isWorkflowFeatureEnabled: () => true })),
    );
    assert.doesNotThrow(() =>
      assertWorkflowTenantAccess(
        ctx({ isWorkflowFeatureEnabled: () => true }),
        "company-1",
        "automation.create",
      ),
    );
  });
});
