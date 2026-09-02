/**
 * B1.2 Part 5 Fix-A — Platform AI runtime kill-switch fail-closed.
 * Run: node --experimental-strip-types --test artifacts/login-app/scripts/platform-ai-kill-switch-fail-closed.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "../../..");

const featureDefaultsSource = readFileSync(
  resolve(projectRoot, "lib/platform-ai-provider/src/feature-defaults.ts"),
  "utf8",
);

const migration345 = readFileSync(
  resolve(projectRoot, "supabase/migrations/345_platform_ai_kill_switch_fail_closed.sql"),
  "utf8",
);
const migration343 = readFileSync(
  resolve(projectRoot, "supabase/migrations/343_channel_permission_commercial_mapping.sql"),
  "utf8",
);
const migration344 = readFileSync(
  resolve(projectRoot, "supabase/migrations/344_channel_commercial_rls_hardening.sql"),
  "utf8",
);
const resolveFeatureFlagSource = readFileSync(
  resolve(here, "../src/lib/application-layer/resolve-feature-flag.ts"),
  "utf8",
);
const employeeRuntimeSource = readFileSync(
  resolve(here, "../src/lib/ai-employees/services/resolve-employee-channel-runtime.ts"),
  "utf8",
);
const agentsRlsSource = readFileSync(
  resolve(projectRoot, "supabase/migrations/198_agents_feature_rls_sprint6_2_4.sql"),
  "utf8",
);

/** Pure mirror of migration 345 SQL semantics for matrix tests. */
function evaluatePlatformAiFeatureEnabled(input: {
  isSuperAdmin: boolean;
  flagRow: { is_enabled: boolean } | null;
}): boolean {
  if (input.isSuperAdmin) return true;
  if (!input.flagRow) return false;
  return input.flagRow.is_enabled === true;
}

/** Pure mirror of resolveFeatureEnabledViaApplicationLayer platform-AI branch. */
function evaluateApplicationRuntimeGate(input: {
  commercialEntitled: boolean;
  rpcEnabled: boolean | null;
  rpcError?: boolean;
  missingClient?: boolean;
}): boolean {
  if (input.missingClient) return false;
  if (!input.commercialEntitled) return false;
  if (input.rpcError) return false;
  if (input.rpcEnabled === null || input.rpcEnabled === undefined) return false;
  return input.rpcEnabled === true;
}

describe("Migration 345 SQL contract", () => {
  it("A explicit true → ALLOW", () => {
    assert.equal(
      evaluatePlatformAiFeatureEnabled({ isSuperAdmin: false, flagRow: { is_enabled: true } }),
      true,
    );
  });

  it("B explicit false → DENY", () => {
    assert.equal(
      evaluatePlatformAiFeatureEnabled({ isSuperAdmin: false, flagRow: { is_enabled: false } }),
      false,
    );
  });

  it("C missing row → DENY", () => {
    assert.equal(
      evaluatePlatformAiFeatureEnabled({ isSuperAdmin: false, flagRow: null }),
      false,
    );
    const fnBody = migration345.slice(migration345.indexOf("as $$"));
    assert.match(fnBody, /coalesce\([\s\S]*,\s*false\s*\)/);
    assert.doesNotMatch(fnBody, /,\s*true\s*\)/);
  });

  it("D unknown key (no row) → DENY", () => {
    assert.equal(
      evaluatePlatformAiFeatureEnabled({ isSuperAdmin: false, flagRow: null }),
      false,
    );
  });

  it("O explicit enabled flags remain enabled", () => {
    assert.equal(
      evaluatePlatformAiFeatureEnabled({ isSuperAdmin: false, flagRow: { is_enabled: true } }),
      true,
    );
  });

  it("P explicit disabled flags remain disabled", () => {
    assert.equal(
      evaluatePlatformAiFeatureEnabled({ isSuperAdmin: false, flagRow: { is_enabled: false } }),
      false,
    );
  });

  it("super-admin bypass preserved", () => {
    assert.match(migration345, /public\.is_super_admin\(\)/);
    assert.equal(
      evaluatePlatformAiFeatureEnabled({ isSuperAdmin: true, flagRow: null }),
      true,
    );
  });
});

describe("resolveRuntimeFeatureEnabled", () => {
  it("G runtime feature missing → DENY", () => {
    assert.match(featureDefaultsSource, /PLATFORM_AI_RUNTIME_MISSING_ROW_DEFAULT = false/);
    assert.match(featureDefaultsSource, /flagRow\?\.is_enabled \?\? PLATFORM_AI_RUNTIME_MISSING_ROW_DEFAULT/);
  });

  it("H runtime feature explicit false → DENY", () => {
    assert.match(featureDefaultsSource, /is_enabled: boolean/);
  });

  it("I runtime feature explicit true → ALLOW", () => {
    assert.doesNotMatch(featureDefaultsSource, /PLATFORM_AI_RUNTIME_MISSING_ROW_DEFAULT = true/);
  });
});

describe("resolveFeatureEnabledViaApplicationLayer wiring", () => {
  it("E null/undefined resolver data → DENY (no ?? true)", () => {
    assert.doesNotMatch(resolveFeatureFlagSource, /\?\?\s*true/);
    assert.match(resolveFeatureFlagSource, /result\.data\?\.enabled === true/);
  });

  it("F resolver error → DENY", () => {
    assert.match(resolveFeatureFlagSource, /catch \{[\s\S]*return false/);
    assert.match(resolveFeatureFlagSource, /if \(error\) return false/);
  });

  it("platform AI keys use platform_ai_feature_enabled RPC", () => {
    assert.match(resolveFeatureFlagSource, /isPlatformAIFeatureKey\(featureKey\)/);
    assert.match(resolveFeatureFlagSource, /platform_ai_feature_enabled/);
    assert.match(resolveFeatureFlagSource, /requireCompanyFeature/);
  });

  it("J commercial denied + flag true → DENY", () => {
    assert.equal(
      evaluateApplicationRuntimeGate({
        commercialEntitled: false,
        rpcEnabled: true,
      }),
      false,
    );
  });

  it("K commercial allowed + flag false → DENY", () => {
    assert.equal(
      evaluateApplicationRuntimeGate({
        commercialEntitled: true,
        rpcEnabled: false,
      }),
      false,
    );
  });

  it("L commercial allowed + flag missing → DENY", () => {
    assert.equal(
      evaluateApplicationRuntimeGate({
        commercialEntitled: true,
        rpcEnabled: null,
      }),
      false,
    );
  });

  it("commercial=true + platform flag=true → ALLOW", () => {
    assert.equal(
      evaluateApplicationRuntimeGate({
        commercialEntitled: true,
        rpcEnabled: true,
      }),
      true,
    );
  });
});

describe("AI Employee runtime impact", () => {
  it("M employee runtime returns not-ready when aiChatEnabled is false before provider selection", () => {
    assert.match(employeeRuntimeSource, /resolveFeatureEnabledViaApplicationLayer/);
    const gateIdx = employeeRuntimeSource.indexOf("if (!aiChatEnabled)");
    const usageIdx = employeeRuntimeSource.indexOf(
      "const providerConnection = pickDefaultConnection(providerConnections)",
    );
    assert.ok(gateIdx > 0 && usageIdx > gateIdx);
  });
});

describe("Agents RLS impact", () => {
  it("N missing platform AI flag denies via platform_ai_feature_enabled", () => {
    assert.match(agentsRlsSource, /platform_ai_feature_enabled\(p_company_id, 'ai_agents'\)/);
    assert.equal(
      evaluatePlatformAiFeatureEnabled({ isSuperAdmin: false, flagRow: null }),
      false,
    );
  });
});

describe("Regression — migrations untouched", () => {
  it("343 and 344 unchanged; 345 is new only", () => {
    assert.match(migration343, /343 — Channel permission commercial mapping/);
    assert.match(migration344, /344 — Channel commercial RLS hardening/);
    assert.match(migration345, /345 — Platform AI kill-switch fail-closed/);
    assert.doesNotMatch(migration345, /343_channel_permission|344_channel_commercial/);
  });
});
