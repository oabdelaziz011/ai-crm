import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveAgentNavigationGating,
  resolveAgentStartErrorMessage,
  resolveAgentWorkflowPanelGating,
} from "./agent-ui-gating.js";

const AGENTS_VIEW = "agents.view";
const AGENTS_EXECUTE = "agents.execute";

function hasPermission(codes: readonly string[]) {
  return (code: string) => codes.includes(code);
}

function accessInput(input: {
  isSuperAdmin?: boolean;
  permissions?: readonly string[];
  agentsFeatureEnabled?: boolean | undefined;
}) {
  return {
    isSuperAdmin: input.isSuperAdmin ?? false,
    hasPermission: hasPermission(input.permissions ?? []),
    agentsFeatureEnabled: input.agentsFeatureEnabled,
  };
}

describe("resolveAgentNavigationGating", () => {
  it("hides agent tab without agents.view", () => {
    assert.equal(
      resolveAgentNavigationGating(accessInput({ permissions: [AGENTS_EXECUTE], agentsFeatureEnabled: true }))
        .showAgentTab,
      false,
    );
  });

  it("shows agent tab with agents.view and feature ON", () => {
    assert.equal(
      resolveAgentNavigationGating(accessInput({ permissions: [AGENTS_VIEW], agentsFeatureEnabled: true }))
        .showAgentTab,
      true,
    );
  });
});

describe("resolveAgentWorkflowPanelGating", () => {
  it("hides history without agents.view", () => {
    const gating = resolveAgentWorkflowPanelGating(
      accessInput({ permissions: [AGENTS_EXECUTE], agentsFeatureEnabled: true }),
    );
    assert.equal(gating.showHistory, false);
    assert.equal(gating.permissionDenied, true);
  });

  it("shows history with agents.view", () => {
    const gating = resolveAgentWorkflowPanelGating(
      accessInput({ permissions: [AGENTS_VIEW], agentsFeatureEnabled: true }),
    );
    assert.equal(gating.showHistory, true);
    assert.equal(gating.permissionDenied, false);
  });

  it("hides start composer without agents.execute", () => {
    const gating = resolveAgentWorkflowPanelGating(
      accessInput({ permissions: [AGENTS_VIEW], agentsFeatureEnabled: true }),
    );
    assert.equal(gating.showStartComposer, false);
    assert.equal(gating.executeDenied, true);
  });

  it("shows start composer with agents.execute", () => {
    const gating = resolveAgentWorkflowPanelGating(
      accessInput({ permissions: [AGENTS_VIEW, AGENTS_EXECUTE], agentsFeatureEnabled: true }),
    );
    assert.equal(gating.showStartComposer, true);
    assert.equal(gating.executeDenied, false);
  });

  it("hides resume without agents.execute", () => {
    const gating = resolveAgentWorkflowPanelGating(
      accessInput({ permissions: [AGENTS_VIEW], agentsFeatureEnabled: true }),
    );
    assert.equal(gating.showResumeButton, false);
  });

  it("shows resume with agents.execute", () => {
    const gating = resolveAgentWorkflowPanelGating(
      accessInput({ permissions: [AGENTS_VIEW, AGENTS_EXECUTE], agentsFeatureEnabled: true }),
    );
    assert.equal(gating.showResumeButton, true);
  });

  it("flags feature-disabled UX when ai_agents is OFF", () => {
    const gating = resolveAgentWorkflowPanelGating(
      accessInput({ permissions: [AGENTS_VIEW, AGENTS_EXECUTE], agentsFeatureEnabled: false }),
    );
    assert.equal(gating.featureDisabled, true);
    assert.equal(gating.showHistory, false);
    assert.equal(gating.showStartComposer, false);
  });

  it("grants super-admin full panel access regardless of feature flag", () => {
    const gating = resolveAgentWorkflowPanelGating(
      accessInput({ isSuperAdmin: true, permissions: [], agentsFeatureEnabled: false }),
    );
    assert.equal(gating.featureDisabled, false);
    assert.equal(gating.permissionDenied, false);
    assert.equal(gating.showHistory, true);
    assert.equal(gating.showStartComposer, true);
    assert.equal(gating.showResumeButton, true);
  });
});

describe("resolveAgentStartErrorMessage", () => {
  const messages = {
    executeDenied: "execute denied",
    permissionDenied: "permission denied",
    featureDisabled: "feature disabled",
  };

  it("maps execute permission runtime errors", () => {
    assert.equal(resolveAgentStartErrorMessage("agents.execute required", messages), messages.executeDenied);
  });

  it("maps generic permission denied runtime errors", () => {
    assert.equal(
      resolveAgentStartErrorMessage("AGENTS_PERMISSION_DENIED: agents.view", messages),
      messages.permissionDenied,
    );
  });

  it("maps feature disabled runtime errors", () => {
    assert.equal(
      resolveAgentStartErrorMessage("AGENTS_FEATURE_DISABLED", messages),
      messages.featureDisabled,
    );
  });

  it("returns null for absent errors", () => {
    assert.equal(resolveAgentStartErrorMessage(null, messages), null);
  });

  it("passes through unknown errors without crashing", () => {
    assert.equal(resolveAgentStartErrorMessage("Conversation not ready", messages), "Conversation not ready");
  });
});
