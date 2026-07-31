/**
 * AI Agent UI permission integration tests (Sprint 6.2.2).
 * Run: npm run test:agents-permissions
 */
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18n from "../src/i18n";
import type { AgentAccessInput } from "../src/lib/platform-ai/agent-ui-gating";
import {
  resolveAgentNavigationGating,
  resolveAgentStartErrorMessage,
  resolveAgentWorkflowPanelGating,
} from "../src/lib/platform-ai/agent-ui-gating";

const AGENTS_VIEW = "agents.view";
const AGENTS_EXECUTE = "agents.execute";

function hasPermission(codes: readonly string[]) {
  return (code: string) => codes.includes(code);
}

function createAccess(input: {
  isSuperAdmin?: boolean;
  permissions?: readonly string[];
  agentsFeatureEnabled?: boolean | undefined;
}): AgentAccessInput {
  return {
    isSuperAdmin: input.isSuperAdmin ?? false,
    hasPermission: hasPermission(input.permissions ?? []),
    agentsFeatureEnabled: input.agentsFeatureEnabled,
  };
}

type NavigationProbeProps = {
  access: AgentAccessInput;
};

function AgentNavigationProbe({ access }: NavigationProbeProps) {
  const { t } = useTranslation("common");
  const { showAgentTab } = resolveAgentNavigationGating(access);

  return React.createElement(
    "div",
    { "data-testid": "floating-ai-tabs" },
    React.createElement("div", { "data-testid": "chat-tab" }, t("floatingAi.tabs.chat")),
    showAgentTab
      ? React.createElement("div", { "data-testid": "agent-tab" }, t("floatingAi.tabs.agent"))
      : null,
  );
}

type WorkflowPanelProbeProps = {
  access: AgentAccessInput;
  activeWorkflowId?: string | null;
  needsResume?: boolean;
  startError?: string | null;
};

function AgentWorkflowPanelProbe({
  access,
  activeWorkflowId = null,
  needsResume = false,
  startError = null,
}: WorkflowPanelProbeProps) {
  const { t } = useTranslation("common");
  const gating = resolveAgentWorkflowPanelGating(access);
  const resolvedStartError = resolveAgentStartErrorMessage(startError, {
    executeDenied: t("agents.executeDenied"),
    permissionDenied: t("agents.permissionDenied"),
    featureDisabled: t("agents.featureDisabled"),
  });

  return React.createElement(
    "div",
    { "data-testid": "agent-workflow-panel" },
    gating.featureDisabled
      ? React.createElement("div", { "data-testid": "banner-feature-disabled" }, t("agents.featureDisabled"))
      : null,
    gating.permissionDenied
      ? React.createElement("div", { "data-testid": "banner-permission-denied" }, t("agents.permissionDenied"))
      : null,
    gating.showHistory
      ? React.createElement("div", { "data-testid": "history-tabs" }, "history")
      : React.createElement("div", { "data-testid": "history-denied" }, t("agents.permissionDenied")),
    !activeWorkflowId && gating.showStartComposer
      ? React.createElement("div", { "data-testid": "start-composer" }, "start")
      : null,
    !activeWorkflowId && gating.executeDenied
      ? React.createElement("div", { "data-testid": "execute-denied" }, t("agents.executeDenied"))
      : null,
    needsResume && gating.showResumeButton
      ? React.createElement("button", { "data-testid": "resume-button", type: "button" }, t("floatingAi.agent.resume"))
      : null,
    resolvedStartError
      ? React.createElement("div", { "data-testid": "start-error" }, resolvedStartError)
      : null,
  );
}

type Harness = {
  root: Root;
  win: Window;
};

function setupHarness(): Harness {
  const win = new Window({ url: "http://localhost/dashboard" });
  (globalThis as { window?: Window; document?: Document }).window = win;
  (globalThis as { window?: Window; document?: Document }).document = win.document;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  const rootEl = win.document.createElement("div");
  win.document.body.appendChild(rootEl);

  return { root: createRoot(rootEl), win };
}

async function renderProbe(harness: Harness, element: React.ReactElement) {
  await act(async () => {
    harness.root.render(React.createElement(I18nextProvider, { i18n }, element));
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 25)));
}

function query(testId: string): HTMLElement | null {
  return (globalThis.document as Document).querySelector(`[data-testid="${testId}"]`);
}

console.log("\nAI Agent UI permission integration tests\n");

void (async () => {
  const harness = setupHarness();

  await renderProbe(
    harness,
    React.createElement(AgentNavigationProbe, {
      access: createAccess({ permissions: [AGENTS_EXECUTE], agentsFeatureEnabled: true }),
    }),
  );
  assert.equal(query("agent-tab"), null, "agent tab hidden without agents.view");
  assert.ok(query("chat-tab"), "chat tab remains visible");
  console.log("  ✓ navigation hides agent tab without agents.view");

  await renderProbe(
    harness,
    React.createElement(AgentNavigationProbe, {
      access: createAccess({ permissions: [AGENTS_VIEW], agentsFeatureEnabled: true }),
    }),
  );
  assert.ok(query("agent-tab"), "agent tab visible with agents.view");
  assert.match(query("agent-tab")?.textContent ?? "", /Agent/);
  console.log("  ✓ navigation shows agent tab with agents.view");

  await renderProbe(
    harness,
    React.createElement(AgentNavigationProbe, {
      access: createAccess({ permissions: [AGENTS_VIEW, AGENTS_EXECUTE], agentsFeatureEnabled: false }),
    }),
  );
  assert.equal(query("agent-tab"), null, "agent tab hidden when feature OFF");
  console.log("  ✓ navigation hides agent tab when ai_agents feature is OFF");

  await renderProbe(
    harness,
    React.createElement(AgentWorkflowPanelProbe, {
      access: createAccess({ permissions: [AGENTS_EXECUTE], agentsFeatureEnabled: true }),
    }),
  );
  assert.ok(query("history-denied"), "history hidden without agents.view");
  assert.equal(query("history-tabs"), null);
  assert.ok(query("banner-permission-denied"), "permission denied banner shown");
  console.log("  ✓ workflow history hidden without agents.view");

  await renderProbe(
    harness,
    React.createElement(AgentWorkflowPanelProbe, {
      access: createAccess({ permissions: [AGENTS_VIEW], agentsFeatureEnabled: true }),
    }),
  );
  assert.ok(query("history-tabs"), "history visible with agents.view");
  assert.equal(query("start-composer"), null, "start hidden without agents.execute");
  assert.ok(query("execute-denied"), "execute denied message shown for view-only users");
  console.log("  ✓ start hidden and execute-denied shown without agents.execute");

  await renderProbe(
    harness,
    React.createElement(AgentWorkflowPanelProbe, {
      access: createAccess({ permissions: [AGENTS_VIEW, AGENTS_EXECUTE], agentsFeatureEnabled: true }),
    }),
  );
  assert.ok(query("start-composer"), "start composer visible with agents.execute");
  assert.equal(query("execute-denied"), null);
  console.log("  ✓ start composer visible with agents.execute");

  await renderProbe(
    harness,
    React.createElement(AgentWorkflowPanelProbe, {
      access: createAccess({ permissions: [AGENTS_VIEW], agentsFeatureEnabled: true }),
      activeWorkflowId: "workflow-1",
      needsResume: true,
    }),
  );
  assert.equal(query("resume-button"), null, "resume hidden without agents.execute");
  console.log("  ✓ resume hidden without agents.execute");

  await renderProbe(
    harness,
    React.createElement(AgentWorkflowPanelProbe, {
      access: createAccess({ permissions: [AGENTS_VIEW, AGENTS_EXECUTE], agentsFeatureEnabled: true }),
      activeWorkflowId: "workflow-1",
      needsResume: true,
    }),
  );
  assert.ok(query("resume-button"), "resume visible with agents.execute");
  console.log("  ✓ resume visible with agents.execute");

  await renderProbe(
    harness,
    React.createElement(AgentWorkflowPanelProbe, {
      access: createAccess({ permissions: [AGENTS_VIEW, AGENTS_EXECUTE], agentsFeatureEnabled: false }),
    }),
  );
  assert.ok(query("banner-feature-disabled"), "feature disabled banner shown");
  assert.equal(query("history-tabs"), null);
  assert.equal(query("start-composer"), null);
  console.log("  ✓ feature OFF hides agent workflow affordances");

  await renderProbe(
    harness,
    React.createElement(AgentNavigationProbe, {
      access: createAccess({ isSuperAdmin: true, permissions: [], agentsFeatureEnabled: false }),
    }),
  );
  assert.ok(query("agent-tab"), "super-admin navigation shows agent tab when feature OFF");
  await renderProbe(
    harness,
    React.createElement(AgentWorkflowPanelProbe, {
      access: createAccess({ isSuperAdmin: true, permissions: [], agentsFeatureEnabled: false }),
    }),
  );
  assert.ok(query("history-tabs"), "super-admin sees workflow history");
  assert.ok(query("start-composer"), "super-admin sees start composer");
  console.log("  ✓ super-admin bypasses permission and feature restrictions");

  await renderProbe(
    harness,
    React.createElement(AgentWorkflowPanelProbe, {
      access: createAccess({ permissions: [AGENTS_VIEW, AGENTS_EXECUTE], agentsFeatureEnabled: true }),
      startError: "AGENTS_PERMISSION_DENIED: agents.execute",
    }),
  );
  const startError = query("start-error");
  assert.ok(startError, "start error region rendered");
  assert.match(startError?.textContent ?? "", /don't have permission/i);
  console.log("  ✓ permission denied start errors map to graceful UX copy");

  await act(async () => {
    harness.root.unmount();
  });
  console.log("\nAll AI Agent UI permission checks passed.\n");
})();
