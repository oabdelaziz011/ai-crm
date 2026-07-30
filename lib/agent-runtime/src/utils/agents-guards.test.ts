import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AgentsFeatureDisabledError } from "../errors.js";
import { assertAgentsFeatureEnabled } from "./agents-guards.js";
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

describe("assertAgentsFeatureEnabled", () => {
  it("allows super-admin regardless of feature flag", () => {
    assert.doesNotThrow(() =>
      assertAgentsFeatureEnabled(
        createContext({
          isSuperAdmin: true,
          isAgentsFeatureEnabled: () => false,
        }),
      ),
    );
  });

  it("allows agent operations when feature flag is on", () => {
    assert.doesNotThrow(() =>
      assertAgentsFeatureEnabled(
        createContext({
          isAgentsFeatureEnabled: () => true,
        }),
      ),
    );
  });

  it("allows agent operations when feature lookup is not wired", () => {
    assert.doesNotThrow(() => assertAgentsFeatureEnabled(createContext()));
  });

  it("denies agent operations when feature flag is off", () => {
    assert.throws(
      () =>
        assertAgentsFeatureEnabled(
          createContext({
            isAgentsFeatureEnabled: () => false,
          }),
        ),
      AgentsFeatureDisabledError,
    );
  });
});
