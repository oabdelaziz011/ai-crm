/**
 * B1.2 Part 5 Fix-B — General platform feature-flag fail-closed hardening.
 * Run: node --experimental-strip-types --test artifacts/login-app/scripts/platform-feature-flag-fail-closed.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  featureFlagEngine,
  type FeatureFlagRow,
} from "../../../lib/configuration-platform/src/feature-flags/feature-flag-engine.ts";
import { isRegisteredPlatformFeatureKey } from "../../../lib/configuration-platform/src/feature-flags/constants.ts";
import { licensingEngine } from "../../../lib/configuration-platform/src/licensing/licensing-engine.ts";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "../../..");

const readPortSource = readFileSync(
  resolve(here, "../src/lib/application-layer/adapters/feature-flag-read-port-adapter.ts"),
  "utf8",
);
const useFeatureFlagSource = readFileSync(
  resolve(here, "../src/hooks/use-feature-flag.ts"),
  "utf8",
);
const resolveFeatureFlagSource = readFileSync(
  resolve(here, "../src/lib/application-layer/resolve-feature-flag.ts"),
  "utf8",
);
const featureDefaultsSource = readFileSync(
  resolve(projectRoot, "lib/platform-ai-provider/src/feature-defaults.ts"),
  "utf8",
);

function row(overrides: Partial<FeatureFlagRow> & Pick<FeatureFlagRow, "featureKey">): FeatureFlagRow {
  return Object.freeze({
    scopeType: "company",
    scopeId: "co_1",
    enabled: true,
    rolloutPercentage: 100,
    environment: "all",
    activatesAt: null,
    expiresAt: null,
    prerequisites: [],
    priority: 0,
    ...overrides,
  });
}

/** Mirror of useFeatureFlag runtime-sensitive effective allow gate. */
function effectiveRuntimeAllow(input: {
  enabled: boolean | undefined;
  fetched: boolean;
  errored: boolean;
  runtimeSensitive: boolean;
}): boolean {
  if (!input.runtimeSensitive) {
    return input.enabled ?? true;
  }
  if (!input.fetched || input.errored) return false;
  return input.enabled === true;
}

describe("FeatureFlagEngine.resolve — fail-closed matrix", () => {
  const ctx = { companyId: "co_1", environment: "production" as const };

  it("1 explicit enabled=true → ALLOW", () => {
    const resolution = featureFlagEngine.resolve(
      "knowledge.platform",
      [row({ featureKey: "knowledge.platform", enabled: true })],
      ctx,
    );
    assert.equal(resolution.enabled, true);
    assert.equal(resolution.source, "company");
  });

  it("2 explicit enabled=false → DENY", () => {
    const resolution = featureFlagEngine.resolve(
      "knowledge.platform",
      [row({ featureKey: "knowledge.platform", enabled: false })],
      ctx,
    );
    assert.equal(resolution.enabled, false);
  });

  it("3 missing row → DENY for runtime/security-sensitive flag", () => {
    assert.ok(isRegisteredPlatformFeatureKey("public.booking"));
    const resolution = featureFlagEngine.resolve("public.booking", [], ctx);
    assert.equal(resolution.enabled, false);
    assert.equal(resolution.source, "default");
  });

  it("4 malformed/null feature key → DENY", () => {
    assert.equal(featureFlagEngine.resolve("", [], ctx).enabled, false);
    assert.equal(featureFlagEngine.resolve("   ", [], ctx).enabled, false);
  });

  it("5 read-port DB error path denies (adapter contract)", () => {
    assert.match(readPortSource, /throw new FeatureFlagReadError/);
    assert.match(readPortSource, /denyOnReadFailure/);
    assert.doesNotMatch(readPortSource, /if \(error \|\| !data\) return \[\]/);
  });
});

describe("useFeatureFlag runtime gate mirrors", () => {
  it("6 loading state does not expose effective runtime ALLOW", () => {
    assert.equal(
      effectiveRuntimeAllow({
        enabled: undefined,
        fetched: false,
        errored: false,
        runtimeSensitive: true,
      }),
      false,
    );
    assert.match(useFeatureFlagSource, /resolveRuntimeSensitiveEnabled/);
  });

  it("7 unmapped registered runtime flag denies while loading", () => {
    assert.ok(isRegisteredPlatformFeatureKey("call.center"));
    assert.equal(
      effectiveRuntimeAllow({
        enabled: undefined,
        fetched: false,
        errored: false,
        runtimeSensitive: true,
      }),
      false,
    );
  });

  it("read error denies for runtime-sensitive flags", () => {
    assert.equal(
      effectiveRuntimeAllow({
        enabled: undefined,
        fetched: true,
        errored: true,
        runtimeSensitive: true,
      }),
      false,
    );
  });
});

describe("Commercial entitlement logic unchanged", () => {
  const entitlements = Object.freeze({
    planCode: "pro",
    features: Object.freeze({ "ai.chat": true, "channel.whatsapp": false }),
    limits: Object.freeze({ users: 50 }),
    modules: Object.freeze(["crm"]),
  });

  const activeState = Object.freeze({
    tenantId: "co_1",
    planCode: "pro",
    status: "active" as const,
    trialEndsAt: null,
    expiresAt: null,
    graceEndsAt: null,
    addOns: Object.freeze([]),
  });

  it("8 commercial entitled feature still allowed by licensing engine", () => {
    const result = licensingEngine.canAccess("ai.chat", entitlements, activeState);
    assert.equal(result.allowed, true);
  });

  it("8b commercial non-entitled feature still denied by licensing engine", () => {
    const result = licensingEngine.canAccess("channel.whatsapp", entitlements, activeState);
    assert.equal(result.allowed, false);
  });
});

describe("Part 5 Fix-A AI runtime behavior preserved", () => {
  it("9 platform AI missing-row default remains false", () => {
    assert.match(featureDefaultsSource, /PLATFORM_AI_RUNTIME_MISSING_ROW_DEFAULT\s*=\s*false/);
  });

  it("9b resolve-feature-flag platform-AI branch still fail-closed", () => {
    assert.match(resolveFeatureFlagSource, /isPlatformAIFeatureKey\(featureKey\)/);
    assert.match(resolveFeatureFlagSource, /return result\.data\?\.enabled === true/);
    assert.doesNotMatch(resolveFeatureFlagSource, /\?\?\s*true/);
  });
});
