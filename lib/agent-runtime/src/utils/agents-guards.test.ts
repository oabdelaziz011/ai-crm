import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENT_PERMISSIONS } from "../constants.js";
import { AgentsFeatureDisabledError, AgentsPermissionDeniedError } from "../errors.js";
import {
  assertAgentsExecuteAccess,
  assertAgentsFeatureEnabled,
  assertAgentsReadAccess,
  assertAgentsViewPermission,
  assertAgentsExecutePermission,
} from "./agents-guards.js";
import type { ServiceContext } from "../types.js";

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) => code === AGENT_PERMISSIONS.view || code === AGENT_PERMISSIONS.execute,
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

describe("assertAgentsViewPermission", () => {
  it("allows super-admin without agents.view", () => {
    assert.doesNotThrow(() =>
      assertAgentsViewPermission(
        createContext({
          isSuperAdmin: true,
          hasPermission: () => false,
        }),
      ),
    );
  });

  it("allows read when agents.view granted", () => {
    assert.doesNotThrow(() =>
      assertAgentsViewPermission(
        createContext({
          hasPermission: (code) => code === AGENT_PERMISSIONS.view,
        }),
      ),
    );
  });

  it("denies read when agents.view missing", () => {
    assert.throws(
      () =>
        assertAgentsViewPermission(
          createContext({
            hasPermission: () => false,
          }),
        ),
      AgentsPermissionDeniedError,
    );
  });
});

describe("assertAgentsExecutePermission", () => {
  it("allows execute when agents.execute granted", () => {
    assert.doesNotThrow(() =>
      assertAgentsExecutePermission(
        createContext({
          hasPermission: (code) => code === AGENT_PERMISSIONS.execute,
        }),
      ),
    );
  });

  it("denies execute when agents.execute missing", () => {
    assert.throws(
      () =>
        assertAgentsExecutePermission(
          createContext({
            hasPermission: (code) => code === AGENT_PERMISSIONS.view,
          }),
        ),
      AgentsPermissionDeniedError,
    );
  });
});

describe("assertAgentsReadAccess", () => {
  it("denies when feature disabled", () => {
    assert.throws(
      () =>
        assertAgentsReadAccess(
          createContext({
            isAgentsFeatureEnabled: () => false,
          }),
        ),
      AgentsFeatureDisabledError,
    );
  });

  it("denies when view permission missing", () => {
    assert.throws(
      () =>
        assertAgentsReadAccess(
          createContext({
            hasPermission: () => false,
          }),
        ),
      AgentsPermissionDeniedError,
    );
  });
});

describe("assertAgentsExecuteAccess", () => {
  it("denies when execute permission missing", () => {
    assert.throws(
      () =>
        assertAgentsExecuteAccess(
          createContext({
            hasPermission: (code) => code === AGENT_PERMISSIONS.view,
          }),
        ),
      AgentsPermissionDeniedError,
    );
  });
});
