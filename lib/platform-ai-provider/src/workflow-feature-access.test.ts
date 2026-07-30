import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isWorkflowAiNodeEligible,
  isWorkflowExecutionEligible,
  isWorkflowKnowledgeNodeEligible,
  isWorkflowRouteAccessible,
  isWorkflowToolLoopEligible,
  shouldShowWorkflowNavigation,
} from "./workflow-feature-access.js";
import { PLATFORM_AI_CAPABILITY_ID } from "./capability-ids.js";
import { PLATFORM_AI_FEATURE_KEY } from "./feature-keys.js";
import { getBackendFeatureKeyForCapability } from "./capability-mapping.js";
import { resolveCatalogFeatureEnabled } from "./feature-defaults.js";

describe("Workflow feature access", () => {
  it("allows route access when automation ON and RBAC granted", () => {
    assert.equal(
      isWorkflowRouteAccessible({
        isSuperAdmin: false,
        hasAutomationViewPermission: true,
        workflowFeatureEnabled: true,
      }),
      true,
    );
  });

  it("denies route access when automation OFF even with RBAC", () => {
    assert.equal(
      isWorkflowRouteAccessible({
        isSuperAdmin: false,
        hasAutomationViewPermission: true,
        workflowFeatureEnabled: false,
      }),
      false,
    );
  });

  it("denies route access when RBAC missing even if automation ON", () => {
    assert.equal(
      isWorkflowRouteAccessible({
        isSuperAdmin: false,
        hasAutomationViewPermission: false,
        workflowFeatureEnabled: true,
      }),
      false,
    );
  });

  it("allows super-admin route access regardless of feature flag", () => {
    assert.equal(
      isWorkflowRouteAccessible({
        isSuperAdmin: true,
        hasAutomationViewPermission: false,
        workflowFeatureEnabled: false,
      }),
      true,
    );
  });

  it("treats missing DB row as accessible for routes (undefined lookup)", () => {
    assert.equal(
      isWorkflowRouteAccessible({
        isSuperAdmin: false,
        hasAutomationViewPermission: true,
        workflowFeatureEnabled: undefined,
      }),
      true,
    );
  });

  it("hides sidebar navigation when automation OFF", () => {
    assert.equal(
      shouldShowWorkflowNavigation({
        isSuperAdmin: false,
        hasAutomationViewPermission: true,
        workflowFeatureEnabled: false,
      }),
      false,
    );
  });

  it("allows non-AI workflow execution when automation ON", () => {
    assert.equal(isWorkflowExecutionEligible({ automationEnabled: true }), true);
    assert.equal(isWorkflowExecutionEligible({ automationEnabled: false }), false);
  });

  it("requires automation and ai_chat for AI LLM nodes", () => {
    assert.equal(
      isWorkflowAiNodeEligible({ automationEnabled: true, aiChatEnabled: true }),
      true,
    );
    assert.equal(
      isWorkflowAiNodeEligible({ automationEnabled: false, aiChatEnabled: true }),
      false,
    );
    assert.equal(
      isWorkflowAiNodeEligible({ automationEnabled: true, aiChatEnabled: false }),
      false,
    );
  });

  it("requires automation, ai_chat, and tool_calling for tool loops", () => {
    assert.equal(
      isWorkflowToolLoopEligible({
        automationEnabled: true,
        aiChatEnabled: true,
        toolCallingEnabled: true,
      }),
      true,
    );
    assert.equal(
      isWorkflowToolLoopEligible({
        automationEnabled: true,
        aiChatEnabled: true,
        toolCallingEnabled: false,
      }),
      false,
    );
  });

  it("requires automation, knowledge, and embeddings for knowledge-search nodes", () => {
    assert.equal(
      isWorkflowKnowledgeNodeEligible({
        automationEnabled: true,
        knowledgeEnabled: true,
        embeddingsEnabled: true,
      }),
      true,
    );
    assert.equal(
      isWorkflowKnowledgeNodeEligible({
        automationEnabled: true,
        knowledgeEnabled: false,
        embeddingsEnabled: true,
      }),
      false,
    );
  });
});

describe("Workflow AI catalog mapping", () => {
  it("maps workflow_ai to automation backend key", () => {
    assert.equal(
      getBackendFeatureKeyForCapability(PLATFORM_AI_CAPABILITY_ID.WORKFLOW_AI),
      PLATFORM_AI_FEATURE_KEY.AUTOMATION,
    );
  });

  it("catalog defaults to disabled when DB row missing and defaultEnabled false", () => {
    assert.equal(
      resolveCatalogFeatureEnabled(PLATFORM_AI_FEATURE_KEY.AUTOMATION, undefined, false),
      false,
    );
  });

  it("catalog reflects OFF row for existing companies", () => {
    assert.equal(
      resolveCatalogFeatureEnabled(
        PLATFORM_AI_FEATURE_KEY.AUTOMATION,
        { is_enabled: false },
        false,
      ),
      false,
    );
  });

  it("runtime missing row remains enabled for existing companies (RPC parity)", () => {
    assert.equal(
      resolveCatalogFeatureEnabled(PLATFORM_AI_FEATURE_KEY.AUTOMATION, undefined),
      false,
    );
  });
});
