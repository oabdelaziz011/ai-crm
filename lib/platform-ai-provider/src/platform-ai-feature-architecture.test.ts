import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PLATFORM_AI_CAPABILITY_FEATURE_MAPPINGS,
  getBackendFeatureKeyForCapability,
} from "./capability-mapping.js";
import { PLATFORM_AI_CAPABILITY_ID } from "./capability-ids.js";
import { PLATFORM_AI_FEATURE_KEY, PLATFORM_AI_FEATURE_KEYS } from "./feature-keys.js";
import { PLATFORM_AI_FEATURE_KEY_AUDIT } from "./feature-registry.js";
import {
  catalogMissingRowDefault,
  resolveCatalogFeatureEnabled,
  resolveRuntimeFeatureEnabled,
} from "./feature-defaults.js";

describe("Platform AI feature keys", () => {
  it("includes ai_agents and matches audit registry size", () => {
    assert.ok(PLATFORM_AI_FEATURE_KEYS.includes(PLATFORM_AI_FEATURE_KEY.AI_AGENTS));
    assert.equal(Object.keys(PLATFORM_AI_FEATURE_KEY_AUDIT).length, PLATFORM_AI_FEATURE_KEYS.length);
  });

  it("maps live capabilities to backend keys", () => {
    const live = PLATFORM_AI_CAPABILITY_FEATURE_MAPPINGS.filter((entry) => entry.catalogLive);
    assert.deepEqual(
      live.map((entry) => entry.capabilityId).sort(),
      [
        PLATFORM_AI_CAPABILITY_ID.AI_AGENTS,
        PLATFORM_AI_CAPABILITY_ID.AI_ANALYTICS,
        PLATFORM_AI_CAPABILITY_ID.AI_CHAT,
        PLATFORM_AI_CAPABILITY_ID.KNOWLEDGE_BASE,
        PLATFORM_AI_CAPABILITY_ID.WORKFLOW_AI,
      ].sort(),
    );
  });

  it("maps ai_agents capability to ai_agents feature key as live catalog", () => {
    const mapping = PLATFORM_AI_CAPABILITY_FEATURE_MAPPINGS.find(
      (entry) => entry.capabilityId === PLATFORM_AI_CAPABILITY_ID.AI_AGENTS,
    );
    assert.ok(mapping);
    assert.equal(mapping.backendFeatureKey, PLATFORM_AI_FEATURE_KEY.AI_AGENTS);
    assert.equal(mapping.catalogLive, true);
    assert.deepEqual(mapping.relatedFeatureKeys, [PLATFORM_AI_FEATURE_KEY.AI_CHAT]);
  });
});

describe("Platform AI unified defaults", () => {
  it("runtime missing row defaults to disabled (RPC parity, migration 345)", () => {
    assert.equal(resolveRuntimeFeatureEnabled(undefined), false);
    assert.equal(resolveRuntimeFeatureEnabled({ is_enabled: false }), false);
    assert.equal(resolveRuntimeFeatureEnabled({ is_enabled: true }), true);
  });

  it("catalog ai_chat missing row defaults to enabled", () => {
    assert.equal(resolveCatalogFeatureEnabled(PLATFORM_AI_FEATURE_KEY.AI_CHAT, undefined), true);
    assert.equal(
      resolveCatalogFeatureEnabled(PLATFORM_AI_FEATURE_KEY.AI_CHAT, undefined, false),
      false,
    );
    assert.equal(catalogMissingRowDefault(PLATFORM_AI_FEATURE_KEY.AI_CHAT), true);
  });

  it("catalog non-ai_chat missing row defaults to disabled", () => {
    for (const key of PLATFORM_AI_FEATURE_KEYS) {
      if (key === PLATFORM_AI_FEATURE_KEY.AI_CHAT) continue;
      assert.equal(resolveCatalogFeatureEnabled(key, undefined), false);
      assert.equal(catalogMissingRowDefault(key), false);
    }
  });

  it("catalog honors explicit DB rows for all keys", () => {
    for (const key of PLATFORM_AI_FEATURE_KEYS) {
      assert.equal(resolveCatalogFeatureEnabled(key, { is_enabled: true }), true);
      assert.equal(resolveCatalogFeatureEnabled(key, { is_enabled: false }), false);
    }
  });
});
