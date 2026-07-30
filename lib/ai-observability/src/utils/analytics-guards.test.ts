import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AnalyticsFeatureDisabledError, PermissionDeniedError } from "../errors.js";
import { assertAnalyticsFeatureEnabled } from "./analytics-guards.js";
import type { ServiceContext } from "../types.js";

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: () => true,
    ...overrides,
  };
}

describe("assertAnalyticsFeatureEnabled", () => {
  it("allows super-admin regardless of feature flag", () => {
    assert.doesNotThrow(() =>
      assertAnalyticsFeatureEnabled(
        createContext({
          isSuperAdmin: true,
          isAnalyticsFeatureEnabled: () => false,
        }),
      ),
    );
  });

  it("allows reads when feature flag is on", () => {
    assert.doesNotThrow(() =>
      assertAnalyticsFeatureEnabled(
        createContext({
          isAnalyticsFeatureEnabled: () => true,
        }),
      ),
    );
  });

  it("allows reads when feature lookup is not wired", () => {
    assert.doesNotThrow(() => assertAnalyticsFeatureEnabled(createContext()));
  });

  it("denies reads when feature flag is off", () => {
    assert.throws(
      () =>
        assertAnalyticsFeatureEnabled(
          createContext({
            isAnalyticsFeatureEnabled: () => false,
          }),
        ),
      AnalyticsFeatureDisabledError,
    );
  });
});

describe("Analytics guard regression", () => {
  it("does not throw PermissionDeniedError for disabled feature", () => {
    assert.throws(
      () =>
        assertAnalyticsFeatureEnabled(
          createContext({
            hasPermission: () => false,
            isAnalyticsFeatureEnabled: () => false,
          }),
        ),
      (error: unknown) => error instanceof AnalyticsFeatureDisabledError,
    );
    assert.notEqual(PermissionDeniedError, AnalyticsFeatureDisabledError);
  });
});
