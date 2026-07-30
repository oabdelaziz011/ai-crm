import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canReadAnalytics,
  canReadTraces,
  isAnalyticsRouteAccessible,
  shouldShowAnalyticsNavigation,
} from "./analytics-feature-access.js";
import { PLATFORM_AI_CAPABILITY_ID } from "./capability-ids.js";
import { PLATFORM_AI_FEATURE_KEY } from "./feature-keys.js";
import { getBackendFeatureKeyForCapability } from "./capability-mapping.js";
import { resolveCatalogFeatureEnabled } from "./feature-defaults.js";

describe("Analytics feature access", () => {
  it("allows route access when feature ON and RBAC granted", () => {
    assert.equal(
      isAnalyticsRouteAccessible({
        isSuperAdmin: false,
        hasAnalyticsViewPermission: true,
        analyticsFeatureEnabled: true,
      }),
      true,
    );
  });

  it("denies route access when feature OFF even with RBAC", () => {
    assert.equal(
      isAnalyticsRouteAccessible({
        isSuperAdmin: false,
        hasAnalyticsViewPermission: true,
        analyticsFeatureEnabled: false,
      }),
      false,
    );
  });

  it("denies route access when RBAC missing even if feature ON", () => {
    assert.equal(
      isAnalyticsRouteAccessible({
        isSuperAdmin: false,
        hasAnalyticsViewPermission: false,
        analyticsFeatureEnabled: true,
      }),
      false,
    );
  });

  it("allows super-admin route access regardless of feature flag", () => {
    assert.equal(
      isAnalyticsRouteAccessible({
        isSuperAdmin: true,
        hasAnalyticsViewPermission: false,
        analyticsFeatureEnabled: false,
      }),
      true,
    );
  });

  it("treats missing DB row as accessible for routes (undefined lookup)", () => {
    assert.equal(
      isAnalyticsRouteAccessible({
        isSuperAdmin: false,
        hasAnalyticsViewPermission: true,
        analyticsFeatureEnabled: undefined,
      }),
      true,
    );
  });

  it("hides sidebar navigation when feature OFF", () => {
    assert.equal(
      shouldShowAnalyticsNavigation({
        isSuperAdmin: false,
        hasAnalyticsViewPermission: true,
        analyticsFeatureEnabled: false,
      }),
      false,
    );
  });

  it("allows read analytics when feature ON or missing row", () => {
    assert.equal(canReadAnalytics({ isSuperAdmin: false, analyticsFeatureEnabled: true }), true);
    assert.equal(canReadAnalytics({ isSuperAdmin: false, analyticsFeatureEnabled: undefined }), true);
  });

  it("denies read analytics when feature OFF", () => {
    assert.equal(canReadAnalytics({ isSuperAdmin: false, analyticsFeatureEnabled: false }), false);
  });

  it("allows super-admin read regardless of feature flag", () => {
    assert.equal(canReadAnalytics({ isSuperAdmin: true, analyticsFeatureEnabled: false }), true);
    assert.equal(canReadTraces({ isSuperAdmin: true, analyticsFeatureEnabled: false }), true);
  });

  it("mirrors trace read policy on analytics flag", () => {
    assert.equal(canReadTraces({ isSuperAdmin: false, analyticsFeatureEnabled: false }), false);
    assert.equal(canReadTraces({ isSuperAdmin: false, analyticsFeatureEnabled: true }), true);
  });
});

describe("AI Analytics catalog mapping", () => {
  it("maps ai_analytics to ai_analytics backend key", () => {
    assert.equal(
      getBackendFeatureKeyForCapability(PLATFORM_AI_CAPABILITY_ID.AI_ANALYTICS),
      PLATFORM_AI_FEATURE_KEY.AI_ANALYTICS,
    );
  });

  it("catalog defaults to disabled when DB row missing and defaultEnabled false", () => {
    assert.equal(
      resolveCatalogFeatureEnabled(PLATFORM_AI_FEATURE_KEY.AI_ANALYTICS, undefined, false),
      false,
    );
  });

  it("catalog reflects OFF row for existing companies", () => {
    assert.equal(
      resolveCatalogFeatureEnabled(
        PLATFORM_AI_FEATURE_KEY.AI_ANALYTICS,
        { is_enabled: false },
        false,
      ),
      false,
    );
  });
});
