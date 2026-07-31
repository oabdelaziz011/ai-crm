import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canExecuteAgentWorkflow,
  canManageAgentWorkflows,
  canResumeAgentWorkflow,
  canStartAgentWorkflow,
  canViewAgentHistory,
  hasAgentsExecutePermission,
  hasAgentsManagePermission,
  hasAgentsViewPermission,
  hasManagePermission,
  isAgentsAccessible,
  shouldShowAgentsNavigation,
} from "./agents-access.js";

const AGENTS_VIEW = "agents.view";
const AGENTS_EXECUTE = "agents.execute";
const AGENTS_MANAGE = "agents.manage";

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

describe("agents-access permission helpers", () => {
  it("grants view permission to super-admin without agents.view", () => {
    assert.equal(hasAgentsViewPermission(() => false, true), true);
    assert.equal(hasManagePermission(() => false, true), true);
  });

  it("maps permission codes for view, execute, and manage", () => {
    const check = hasPermission([AGENTS_VIEW, AGENTS_EXECUTE, AGENTS_MANAGE]);
    assert.equal(hasAgentsViewPermission(check, false), true);
    assert.equal(hasAgentsExecutePermission(check, false), true);
    assert.equal(hasAgentsManagePermission(check, false), true);
  });

  it("denies navigation without agents.view even when feature is ON", () => {
    assert.equal(
      shouldShowAgentsNavigation(accessInput({ permissions: [AGENTS_EXECUTE], agentsFeatureEnabled: true })),
      false,
    );
  });

  it("shows navigation with agents.view and feature ON", () => {
    assert.equal(
      shouldShowAgentsNavigation(accessInput({ permissions: [AGENTS_VIEW], agentsFeatureEnabled: true })),
      true,
    );
  });

  it("hides navigation when ai_agents feature is OFF", () => {
    assert.equal(
      shouldShowAgentsNavigation(accessInput({ permissions: [AGENTS_VIEW, AGENTS_EXECUTE], agentsFeatureEnabled: false })),
      false,
    );
  });

  it("allows super-admin navigation when feature is OFF", () => {
    assert.equal(
      shouldShowAgentsNavigation(accessInput({ isSuperAdmin: true, agentsFeatureEnabled: false })),
      true,
    );
  });

  it("allows workflow history read with agents.view", () => {
    assert.equal(
      canViewAgentHistory(accessInput({ permissions: [AGENTS_VIEW], agentsFeatureEnabled: true })),
      true,
    );
    assert.equal(isAgentsAccessible(accessInput({ permissions: [AGENTS_VIEW], agentsFeatureEnabled: true })), true);
  });

  it("denies start and resume without agents.execute", () => {
    const viewOnly = accessInput({ permissions: [AGENTS_VIEW], agentsFeatureEnabled: true });
    assert.equal(canStartAgentWorkflow(viewOnly), false);
    assert.equal(canResumeAgentWorkflow(viewOnly), false);
    assert.equal(canExecuteAgentWorkflow(viewOnly), false);
  });

  it("enables start and resume with agents.execute", () => {
    const executor = accessInput({ permissions: [AGENTS_VIEW, AGENTS_EXECUTE], agentsFeatureEnabled: true });
    assert.equal(canStartAgentWorkflow(executor), true);
    assert.equal(canResumeAgentWorkflow(executor), true);
  });

  it("requires manage permission for administrative workflow actions", () => {
    const executor = accessInput({ permissions: [AGENTS_VIEW, AGENTS_EXECUTE], agentsFeatureEnabled: true });
    assert.equal(canManageAgentWorkflows(executor), false);

    const admin = accessInput({
      permissions: [AGENTS_VIEW, AGENTS_EXECUTE, AGENTS_MANAGE],
      agentsFeatureEnabled: true,
    });
    assert.equal(canManageAgentWorkflows(admin), true);
  });

  it("treats missing feature row as accessible for view and execute helpers", () => {
    const input = accessInput({ permissions: [AGENTS_VIEW, AGENTS_EXECUTE], agentsFeatureEnabled: undefined });
    assert.equal(canViewAgentHistory(input), true);
    assert.equal(canStartAgentWorkflow(input), true);
  });
});
