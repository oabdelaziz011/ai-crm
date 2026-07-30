import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isKnowledgeRetrievalEligible,
  isKnowledgeRouteAccessible,
  shouldShowKnowledgeAssistantTab,
  shouldShowKnowledgeNavigation,
} from "./knowledge-feature-access.js";
import { PLATFORM_AI_FEATURE_KEY } from "./feature-keys.js";
import { PLATFORM_AI_CAPABILITY_ID } from "./capability-ids.js";
import { getBackendFeatureKeyForCapability } from "./capability-mapping.js";
import { resolveCatalogFeatureEnabled } from "./feature-defaults.js";

describe("Knowledge feature access", () => {
  it("allows route access when feature ON and RBAC granted", () => {
    assert.equal(
      isKnowledgeRouteAccessible({
        isSuperAdmin: false,
        hasKnowledgeViewPermission: true,
        knowledgeFeatureEnabled: true,
      }),
      true,
    );
  });

  it("denies route access when feature OFF even with RBAC", () => {
    assert.equal(
      isKnowledgeRouteAccessible({
        isSuperAdmin: false,
        hasKnowledgeViewPermission: true,
        knowledgeFeatureEnabled: false,
      }),
      false,
    );
  });

  it("denies route access when RBAC missing even if feature ON", () => {
    assert.equal(
      isKnowledgeRouteAccessible({
        isSuperAdmin: false,
        hasKnowledgeViewPermission: false,
        knowledgeFeatureEnabled: true,
      }),
      false,
    );
  });

  it("allows super-admin route access regardless of feature flag", () => {
    assert.equal(
      isKnowledgeRouteAccessible({
        isSuperAdmin: true,
        hasKnowledgeViewPermission: false,
        knowledgeFeatureEnabled: false,
      }),
      true,
    );
  });

  it("treats missing DB row as accessible for routes (undefined lookup)", () => {
    assert.equal(
      isKnowledgeRouteAccessible({
        isSuperAdmin: false,
        hasKnowledgeViewPermission: true,
        knowledgeFeatureEnabled: undefined,
      }),
      true,
    );
  });

  it("hides sidebar navigation when feature OFF", () => {
    assert.equal(
      shouldShowKnowledgeNavigation({
        isSuperAdmin: false,
        hasKnowledgeViewPermission: true,
        knowledgeFeatureEnabled: false,
      }),
      false,
    );
  });

  it("hides AI Assistant knowledge tab when feature OFF", () => {
    assert.equal(
      shouldShowKnowledgeAssistantTab({
        isSuperAdmin: false,
        knowledgeFeatureEnabled: false,
      }),
      false,
    );
  });

  it("requires ai_chat, knowledge, and assistant setting for retrieval", () => {
    assert.equal(
      isKnowledgeRetrievalEligible({
        aiChatEnabled: true,
        knowledgeFeatureEnabled: true,
        assistantKnowledgeEnabled: true,
      }),
      true,
    );
    assert.equal(
      isKnowledgeRetrievalEligible({
        aiChatEnabled: false,
        knowledgeFeatureEnabled: true,
        assistantKnowledgeEnabled: true,
      }),
      false,
    );
    assert.equal(
      isKnowledgeRetrievalEligible({
        aiChatEnabled: true,
        knowledgeFeatureEnabled: false,
        assistantKnowledgeEnabled: true,
      }),
      false,
    );
  });
});

describe("Knowledge Base catalog mapping", () => {
  it("maps knowledge_base to knowledge backend key", () => {
    assert.equal(
      getBackendFeatureKeyForCapability(PLATFORM_AI_CAPABILITY_ID.KNOWLEDGE_BASE),
      PLATFORM_AI_FEATURE_KEY.KNOWLEDGE,
    );
  });

  it("catalog defaults to enabled when DB row missing and defaultEnabled true", () => {
    assert.equal(
      resolveCatalogFeatureEnabled(PLATFORM_AI_FEATURE_KEY.KNOWLEDGE, undefined, true),
      true,
    );
  });

  it("catalog reflects OFF row for existing companies", () => {
    assert.equal(
      resolveCatalogFeatureEnabled(
        PLATFORM_AI_FEATURE_KEY.KNOWLEDGE,
        { is_enabled: false },
        true,
      ),
      false,
    );
  });
});
