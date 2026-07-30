import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canResumeAgent,
  canStartAgent,
  isAgentsAccessible,
  shouldShowAgentsNavigation,
} from "./agents-feature-access.js";
import { PLATFORM_AI_CAPABILITY_ID } from "./capability-ids.js";
import { PLATFORM_AI_FEATURE_KEY } from "./feature-keys.js";
import { getBackendFeatureKeyForCapability } from "./capability-mapping.js";
import { resolveCatalogFeatureEnabled } from "./feature-defaults.js";

describe("Agents feature access", () => {
  it("allows access when feature ON and runtime.execute granted", () => {
    assert.equal(
      isAgentsAccessible({
        isSuperAdmin: false,
        hasRuntimeExecutePermission: true,
        agentsFeatureEnabled: true,
      }),
      true,
    );
  });

  it("denies access when feature OFF even with runtime.execute", () => {
    assert.equal(
      isAgentsAccessible({
        isSuperAdmin: false,
        hasRuntimeExecutePermission: true,
        agentsFeatureEnabled: false,
      }),
      false,
    );
  });

  it("denies access when runtime.execute missing even if feature ON", () => {
    assert.equal(
      isAgentsAccessible({
        isSuperAdmin: false,
        hasRuntimeExecutePermission: false,
        agentsFeatureEnabled: true,
      }),
      false,
    );
  });

  it("allows super-admin access regardless of feature flag", () => {
    assert.equal(
      isAgentsAccessible({
        isSuperAdmin: true,
        hasRuntimeExecutePermission: false,
        agentsFeatureEnabled: false,
      }),
      true,
    );
  });

  it("treats missing DB row as accessible (undefined lookup)", () => {
    assert.equal(
      isAgentsAccessible({
        isSuperAdmin: false,
        hasRuntimeExecutePermission: true,
        agentsFeatureEnabled: undefined,
      }),
      true,
    );
  });

  it("hides agent navigation when feature OFF", () => {
    assert.equal(
      shouldShowAgentsNavigation({
        isSuperAdmin: false,
        hasRuntimeExecutePermission: true,
        agentsFeatureEnabled: false,
      }),
      false,
    );
  });

  it("allows start and resume when feature ON or missing row", () => {
    assert.equal(canStartAgent({ isSuperAdmin: false, agentsFeatureEnabled: true }), true);
    assert.equal(canStartAgent({ isSuperAdmin: false, agentsFeatureEnabled: undefined }), true);
    assert.equal(canResumeAgent({ isSuperAdmin: false, agentsFeatureEnabled: true }), true);
  });

  it("denies start and resume when feature OFF", () => {
    assert.equal(canStartAgent({ isSuperAdmin: false, agentsFeatureEnabled: false }), false);
    assert.equal(canResumeAgent({ isSuperAdmin: false, agentsFeatureEnabled: false }), false);
  });

  it("allows super-admin start regardless of feature flag", () => {
    assert.equal(canStartAgent({ isSuperAdmin: true, agentsFeatureEnabled: false }), true);
    assert.equal(canResumeAgent({ isSuperAdmin: true, agentsFeatureEnabled: false }), true);
  });
});

describe("AI Agents catalog mapping", () => {
  it("maps ai_agents to ai_agents backend key", () => {
    assert.equal(
      getBackendFeatureKeyForCapability(PLATFORM_AI_CAPABILITY_ID.AI_AGENTS),
      PLATFORM_AI_FEATURE_KEY.AI_AGENTS,
    );
  });

  it("catalog defaults to disabled when DB row missing and defaultEnabled false", () => {
    assert.equal(
      resolveCatalogFeatureEnabled(PLATFORM_AI_FEATURE_KEY.AI_AGENTS, undefined, false),
      false,
    );
  });

  it("catalog reflects OFF row for existing companies", () => {
    assert.equal(
      resolveCatalogFeatureEnabled(
        PLATFORM_AI_FEATURE_KEY.AI_AGENTS,
        { is_enabled: false },
        false,
      ),
      false,
    );
  });
});
