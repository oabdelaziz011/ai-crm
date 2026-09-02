/**
 * B1.2 Part 5 Fix-C — Dashboard platformFeatureKey fail-closed authorization.
 * Run: node --experimental-strip-types --test artifacts/login-app/scripts/dashboard-route-platform-feature-fail-closed.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  getDashboardRouteById,
  isDashboardRoutePermitted,
} from "../src/config/dashboard-route-registry.ts";
import { PLATFORM_AI_FEATURE_KEY } from "../../../lib/platform-ai-provider/src/feature-keys.ts";

const here = dirname(fileURLToPath(import.meta.url));

function perms(...codes: string[]) {
  const set = new Set(codes);
  return (code: string) => set.has(code);
}

function platformLookup(value: boolean | undefined) {
  return () => value;
}

function entitled(code: string) {
  return (featureCode: string) => featureCode === code;
}

describe("Dashboard platformFeatureKey fail-closed", () => {
  const knowledge = getDashboardRouteById("knowledge");
  const automation = getDashboardRouteById("automation");
  const aiAnalytics = getDashboardRouteById("ai-analytics");
  const agents = getDashboardRouteById("ai-employees");
  const customers = getDashboardRouteById("customers");

  assert.ok(knowledge.platformFeatureKey);
  assert.ok(automation.platformFeatureKey);
  assert.ok(aiAnalytics.platformFeatureKey);
  assert.ok(agents.platformFeatureKey);
  assert.equal(customers.platformFeatureKey, undefined);

  const hasKnowledgeRbac = perms("knowledge.view");
  const knowledgeEntitled = entitled("ai_employee");

  it("A platformFeatureKey + explicit true → ALLOW", () => {
    assert.equal(
      isDashboardRoutePermitted(
        knowledge,
        false,
        hasKnowledgeRbac,
        platformLookup(true),
        knowledgeEntitled,
      ),
      true,
    );
  });

  it("B platformFeatureKey + explicit false → DENY", () => {
    assert.equal(
      isDashboardRoutePermitted(
        knowledge,
        false,
        hasKnowledgeRbac,
        platformLookup(false),
        knowledgeEntitled,
      ),
      false,
    );
  });

  it("C platformFeatureKey missing lookup result → DENY", () => {
    assert.equal(
      isDashboardRoutePermitted(
        knowledge,
        false,
        hasKnowledgeRbac,
        () => undefined,
        knowledgeEntitled,
      ),
      false,
    );
  });

  it("D platformFeatureKey undefined (no lookup passed) → DENY", () => {
    assert.equal(
      isDashboardRoutePermitted(knowledge, false, hasKnowledgeRbac, undefined, knowledgeEntitled),
      false,
    );
  });

  it("E platform flag loading (undefined resolved) → DENY", () => {
    assert.equal(
      isDashboardRoutePermitted(
        automation,
        false,
        perms("automation.view"),
        platformLookup(undefined),
        entitled("workflow_automation"),
      ),
      false,
    );
  });

  it("F platform flag resolution error (undefined) → DENY", () => {
    assert.equal(
      isDashboardRoutePermitted(
        aiAnalytics,
        false,
        perms("ai.analytics.view"),
        platformLookup(undefined),
        entitled("advanced_reports"),
      ),
      false,
    );
  });

  it("G RBAC denied + platform flag true → DENY", () => {
    assert.equal(
      isDashboardRoutePermitted(
        agents,
        false,
        perms(),
        platformLookup(true),
        entitled("ai_employee"),
      ),
      false,
    );
  });

  it("H RBAC allowed + platform flag true → ALLOW", () => {
    assert.equal(
      isDashboardRoutePermitted(
        agents,
        false,
        perms("agents.view"),
        platformLookup(true),
        entitled("ai_employee"),
      ),
      true,
    );
  });

  it("I commercialFeatureCode behavior unchanged (fail-closed on loading)", () => {
    assert.equal(
      isDashboardRoutePermitted(
        knowledge,
        false,
        hasKnowledgeRbac,
        platformLookup(true),
        () => undefined,
      ),
      false,
    );
    assert.equal(
      isDashboardRoutePermitted(
        knowledge,
        false,
        hasKnowledgeRbac,
        platformLookup(true),
        knowledgeEntitled,
      ),
      true,
    );
  });

  it("J routes with neither feature requirement preserve existing behavior", () => {
    assert.equal(
      isDashboardRoutePermitted(customers, false, perms("customers.view"), undefined, () => false),
      true,
    );
    assert.equal(
      isDashboardRoutePermitted(customers, false, perms(), undefined, () => false),
      false,
    );
  });

  it("unknown platformFeatureKey in lookup returns undefined → DENY", () => {
    const lookup = (key: string) => {
      if (key === PLATFORM_AI_FEATURE_KEY.KNOWLEDGE) return undefined;
      return true;
    };
    assert.equal(
      isDashboardRoutePermitted(
        knowledge,
        false,
        hasKnowledgeRbac,
        lookup as (featureKey: typeof PLATFORM_AI_FEATURE_KEY.KNOWLEDGE) => boolean | undefined,
        knowledgeEntitled,
      ),
      false,
    );
  });
});

describe("Fix-C wiring contract", () => {
  it("isDashboardRoutePermitted uses fail-closed platform check (enabled !== true)", () => {
    const source = readFileSync(resolve(here, "../src/config/dashboard-route-registry.ts"), "utf8");
    assert.match(source, /if \(enabled !== true\)/);
    assert.doesNotMatch(source, /if \(enabled === false\)/);
  });
});
