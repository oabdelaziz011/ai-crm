import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canExecuteAgents,
  canManageAgents,
  canResumeAgent,
  canStartAgent,
  canViewAgents,
  isAgentsAccessible,
  shouldShowAgentsNavigation,
} from "./agents-feature-access.js";
import { PLATFORM_AI_CAPABILITY_ID } from "./capability-ids.js";
import { PLATFORM_AI_FEATURE_KEY } from "./feature-keys.js";
import { getBackendFeatureKeyForCapability } from "./capability-mapping.js";
import { resolveCatalogFeatureEnabled } from "./feature-defaults.js";

describe("Agents feature access", () => {
  it("allows view when feature ON and agents.view granted", () => {
    assert.equal(
      canViewAgents({
        isSuperAdmin: false,
        hasAgentsViewPermission: true,
        agentsFeatureEnabled: true,
      }),
      true,
    );
  });

  it("denies view when feature OFF even with agents.view", () => {
    assert.equal(
      canViewAgents({
        isSuperAdmin: false,
        hasAgentsViewPermission: true,
        agentsFeatureEnabled: false,
      }),
      false,
    );
  });

  it("denies view when agents.view missing even if feature ON", () => {
    assert.equal(
      canViewAgents({
        isSuperAdmin: false,
        hasAgentsViewPermission: false,
        agentsFeatureEnabled: true,
      }),
      false,
    );
  });

  it("allows execute when feature ON and agents.execute granted", () => {
    assert.equal(
      canExecuteAgents({
        isSuperAdmin: false,
        hasAgentsExecutePermission: true,
        agentsFeatureEnabled: true,
      }),
      true,
    );
  });

  it("denies execute when agents.execute missing even if feature ON", () => {
    assert.equal(
      canExecuteAgents({
        isSuperAdmin: false,
        hasAgentsExecutePermission: false,
        agentsFeatureEnabled: true,
      }),
      false,
    );
  });

  it("allows super-admin view and execute regardless of feature flag", () => {
    assert.equal(
      canViewAgents({
        isSuperAdmin: true,
        hasAgentsViewPermission: false,
        agentsFeatureEnabled: false,
      }),
      true,
    );
    assert.equal(
      canExecuteAgents({
        isSuperAdmin: true,
        hasAgentsExecutePermission: false,
        agentsFeatureEnabled: false,
      }),
      true,
    );
  });

  it("treats missing DB row as accessible (undefined lookup)", () => {
    assert.equal(
      isAgentsAccessible({
        isSuperAdmin: false,
        hasAgentsViewPermission: true,
        agentsFeatureEnabled: undefined,
      }),
      true,
    );
  });

  it("hides agent navigation when feature OFF", () => {
    assert.equal(
      shouldShowAgentsNavigation({
        isSuperAdmin: false,
        hasAgentsViewPermission: true,
        agentsFeatureEnabled: false,
      }),
      false,
    );
  });

  it("hides agent navigation when agents.view missing", () => {
    assert.equal(
      shouldShowAgentsNavigation({
        isSuperAdmin: false,
        hasAgentsViewPermission: false,
        agentsFeatureEnabled: true,
      }),
      false,
    );
  });

  it("allows start and resume when execute permission ON or missing row", () => {
    assert.equal(
      canStartAgent({
        isSuperAdmin: false,
        hasAgentsExecutePermission: true,
        agentsFeatureEnabled: true,
      }),
      true,
    );
    assert.equal(
      canStartAgent({
        isSuperAdmin: false,
        hasAgentsExecutePermission: true,
        agentsFeatureEnabled: undefined,
      }),
      true,
    );
    assert.equal(
      canResumeAgent({
        isSuperAdmin: false,
        hasAgentsExecutePermission: true,
        agentsFeatureEnabled: true,
      }),
      true,
    );
  });

  it("denies start and resume when feature OFF or execute missing", () => {
    assert.equal(
      canStartAgent({
        isSuperAdmin: false,
        hasAgentsExecutePermission: true,
        agentsFeatureEnabled: false,
      }),
      false,
    );
    assert.equal(
      canStartAgent({
        isSuperAdmin: false,
        hasAgentsExecutePermission: false,
        agentsFeatureEnabled: true,
      }),
      false,
    );
  });

  it("allows super-admin start regardless of feature flag", () => {
    assert.equal(canStartAgent({ isSuperAdmin: true, hasAgentsExecutePermission: false, agentsFeatureEnabled: false }), true);
    assert.equal(canResumeAgent({ isSuperAdmin: true, hasAgentsExecutePermission: false, agentsFeatureEnabled: false }), true);
  });
});

describe("canManageAgents", () => {
  it("allows manage when feature ON and agents.manage granted", () => {
    assert.equal(
      canManageAgents({
        isSuperAdmin: false,
        hasAgentsManagePermission: true,
        agentsFeatureEnabled: true,
      }),
      true,
    );
  });

  it("denies manage when feature OFF even with agents.manage", () => {
    assert.equal(
      canManageAgents({
        isSuperAdmin: false,
        hasAgentsManagePermission: true,
        agentsFeatureEnabled: false,
      }),
      false,
    );
  });

  it("denies manage when agents.manage missing even if feature ON", () => {
    assert.equal(
      canManageAgents({
        isSuperAdmin: false,
        hasAgentsManagePermission: false,
        agentsFeatureEnabled: true,
      }),
      false,
    );
  });

  it("allows super-admin manage regardless of feature flag", () => {
    assert.equal(
      canManageAgents({
        isSuperAdmin: true,
        hasAgentsManagePermission: false,
        agentsFeatureEnabled: false,
      }),
      true,
    );
  });

  it("treats missing DB row as manageable when permission granted", () => {
    assert.equal(
      canManageAgents({
        isSuperAdmin: false,
        hasAgentsManagePermission: true,
        agentsFeatureEnabled: undefined,
      }),
      true,
    );
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
