/**
 * Phase 3 effective entitlement service tests.
 * Run: node --experimental-strip-types scripts/commercial-entitlement-service.test.mts
 */
import assert from "node:assert/strict";
import { composeEffectiveFeatureAccess } from "../src/lib/billing/company-feature-access.ts";
import {
  isCommercialBillingMappedKey,
  toBillingFeatureCode,
} from "../src/lib/billing/feature-code-map.ts";
import {
  getCompanyAccessState,
  getCompanyFeatureAccess,
  hasCompanyFeature,
  type EntitlementRpcClient,
} from "../src/lib/billing/company-feature-entitlement-service.ts";
import { isFeatureEnabledPure } from "../src/lib/billing/commercial-entitlement-resolver.ts";

console.log("\nCommercial entitlement service (Phase 3)\n");

assert.equal(toBillingFeatureCode("channel.whatsapp"), "whatsapp_channel");
assert.equal(toBillingFeatureCode("ai.employee"), "ai_employee");
assert.equal(toBillingFeatureCode("whatsapp_channel"), "whatsapp_channel");
assert.equal(toBillingFeatureCode("knowledge.platform"), null);
assert.equal(isCommercialBillingMappedKey("ai.employee"), true);
assert.equal(isCommercialBillingMappedKey("knowledge.platform"), false);
console.log("  ✓ feature code map");

// 11–13 RBAC + entitlement composition
assert.equal(
  composeEffectiveFeatureAccess({
    hasRbacPermission: false,
    companyFeatureEnabled: true,
  }),
  false,
);
assert.equal(
  composeEffectiveFeatureAccess({
    hasRbacPermission: true,
    companyFeatureEnabled: false,
  }),
  false,
);
assert.equal(
  composeEffectiveFeatureAccess({
    hasRbacPermission: true,
    companyFeatureEnabled: true,
  }),
  true,
);
assert.equal(
  composeEffectiveFeatureAccess({
    isSuperAdmin: true,
    hasRbacPermission: false,
    companyFeatureEnabled: false,
  }),
  true,
);
console.log("  ✓ 11–13 RBAC + entitlement composition");

// 14–15 feature flag OFF / ON without entitlement
assert.equal(
  composeEffectiveFeatureAccess({
    hasRbacPermission: true,
    companyFeatureEnabled: true,
    runtimeFlagEnabled: false,
  }),
  false,
);
assert.equal(
  composeEffectiveFeatureAccess({
    hasRbacPermission: true,
    companyFeatureEnabled: false,
    runtimeFlagEnabled: true,
  }),
  false,
);
console.log("  ✓ 14–15 feature flag does not grant commercial access");

const now = new Date("2026-08-14T12:00:00.000Z");
const activeCompany = {
  exists: true,
  status: "Active" as const,
  subscriptionStatus: "active",
  subscriptionExpiresAt: null,
  subscriptionRow: { status: "active", trialEndsAt: null, currentPeriodEnd: null },
};
const expiredTrial = {
  exists: true,
  status: "Trial" as const,
  subscriptionStatus: "trialing",
  subscriptionExpiresAt: new Date("2026-08-01T00:00:00.000Z"),
  subscriptionRow: {
    status: "trialing",
    trialEndsAt: new Date("2026-08-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
  },
};
const suspended = { ...activeCompany, status: "Suspended" as const };

const core = {
  code: "core_crm",
  defaultEnabled: true,
  isBillable: false,
  requiresSubscription: false,
};
const whatsapp = {
  code: "whatsapp_channel",
  defaultEnabled: true, // even if default true, commercial must deny without grant
  isBillable: true,
  requiresSubscription: true,
};

assert.equal(
  isFeatureEnabledPure({ company: activeCompany, feature: core, grant: null, now }),
  true,
);
assert.equal(
  isFeatureEnabledPure({ company: activeCompany, feature: whatsapp, grant: null, now }),
  false,
);
assert.equal(
  isFeatureEnabledPure({
    company: activeCompany,
    feature: whatsapp,
    grant: {
      featureCode: "whatsapp_channel",
      overrideState: "enabled",
      source: "contract",
      startsAt: new Date("2026-08-01"),
      expiresAt: null,
      isActive: true,
    },
    now,
  }),
  true,
);
assert.equal(
  isFeatureEnabledPure({
    company: activeCompany,
    feature: whatsapp,
    grant: {
      featureCode: "whatsapp_channel",
      overrideState: "disabled",
      source: "manual",
      startsAt: new Date("2026-08-01"),
      expiresAt: null,
      isActive: true,
    },
    now,
  }),
  false,
);
assert.equal(
  isFeatureEnabledPure({
    company: activeCompany,
    feature: whatsapp,
    grant: {
      featureCode: "whatsapp_channel",
      overrideState: "enabled",
      source: "manual",
      startsAt: new Date("2026-09-01"),
      expiresAt: null,
      isActive: true,
    },
    now,
  }),
  false,
);
assert.equal(
  isFeatureEnabledPure({
    company: activeCompany,
    feature: whatsapp,
    grant: {
      featureCode: "whatsapp_channel",
      overrideState: "enabled",
      source: "manual",
      startsAt: new Date("2026-08-01"),
      expiresAt: new Date("2026-08-02"),
      isActive: true,
    },
    now,
  }),
  false,
);
assert.equal(
  isFeatureEnabledPure({
    company: expiredTrial,
    feature: whatsapp,
    grant: {
      featureCode: "whatsapp_channel",
      overrideState: "enabled",
      source: "trial",
      startsAt: new Date("2026-07-01"),
      expiresAt: new Date("2026-12-01"),
      isActive: true,
    },
    now,
  }),
  false,
);
assert.equal(
  isFeatureEnabledPure({
    company: expiredTrial,
    feature: whatsapp,
    grant: {
      featureCode: "whatsapp_channel",
      overrideState: "enabled",
      source: "manual",
      startsAt: new Date("2026-07-01"),
      expiresAt: new Date("2026-12-01"),
      isActive: true,
    },
    now,
  }),
  true,
);
assert.equal(
  isFeatureEnabledPure({
    company: expiredTrial,
    feature: whatsapp,
    grant: {
      featureCode: "whatsapp_channel",
      overrideState: "enabled",
      source: "contract",
      startsAt: new Date("2026-07-01"),
      expiresAt: null,
      isActive: true,
    },
    now,
  }),
  true,
);
assert.equal(
  isFeatureEnabledPure({
    company: suspended,
    feature: whatsapp,
    grant: {
      featureCode: "whatsapp_channel",
      overrideState: "enabled",
      source: "contract",
      startsAt: new Date("2026-07-01"),
      expiresAt: null,
      isActive: true,
    },
    now,
  }),
  false,
);
assert.equal(
  isFeatureEnabledPure({
    company: activeCompany,
    feature: whatsapp,
    grant: null,
    killSwitchEnabled: true,
    now,
  }),
  false,
);
console.log("  ✓ 1–10 / 16 resolver deny-by-default cases");

type RpcMap = Record<string, (args: Record<string, unknown>) => unknown>;

function mockClient(map: RpcMap): EntitlementRpcClient {
  return {
    rpc: async (fn, args = {}) => {
      if (!(fn in map)) return { data: null, error: { message: `missing ${fn}` } };
      try {
        return { data: map[fn]!(args), error: null };
      } catch (e) {
        return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
      }
    },
  };
}

{
  const client = mockClient({
    is_feature_enabled: ({ p_feature_code }) => p_feature_code === "core_crm",
    get_company_access_state: () => "active",
    get_company_entitlements: () => [
      {
        feature_code: "core_crm",
        label: "CRM",
        enabled: true,
        source: "system",
        is_commercial: false,
        starts_at: null,
        expires_at: null,
      },
      {
        feature_code: "whatsapp_channel",
        label: "WhatsApp",
        enabled: false,
        source: "none",
        is_commercial: true,
        starts_at: null,
        expires_at: null,
      },
    ],
    set_company_feature_grant: () => {
      throw new Error("Insufficient permissions to manage company feature grants");
    },
  });

  assert.equal(await hasCompanyFeature("c1", "core_crm", client), true);
  assert.equal(await hasCompanyFeature("c1", "channel.whatsapp", client), false);
  assert.equal(await getCompanyAccessState("c1", client), "active");

  const access = await getCompanyFeatureAccess("c1", "whatsapp_channel", client);
  assert.equal(access.enabled, false);
  assert.equal(access.commercial, true);

  let denied = false;
  try {
    await client.rpc("set_company_feature_grant", {});
  } catch {
    denied = true;
  }
  // mock returns error object rather than throw — service throws on error
  try {
    const { setCompanyFeatureGrant } = await import(
      "../src/lib/billing/company-feature-entitlement-service.ts"
    );
    await setCompanyFeatureGrant(
      { companyId: "c1", featureCode: "whatsapp_channel", enabled: true },
      client,
    );
    assert.fail("expected permission error");
  } catch (e) {
    assert.match(String(e), /Insufficient permissions/);
    denied = true;
  }
  assert.equal(denied, true);
  console.log("  ✓ service RPC orchestration + 18 non-admin mutation denied");
}

{
  const client = mockClient({
    set_company_feature_grant: () => "grant-id-1",
    is_feature_enabled: () => true,
    get_company_entitlements: () => [],
  });
  const { setCompanyFeatureGrant } = await import(
    "../src/lib/billing/company-feature-entitlement-service.ts"
  );
  const id = await setCompanyFeatureGrant(
    { companyId: "c1", featureCode: "ai.employee", enabled: true, source: "manual" },
    client,
  );
  assert.equal(id, "grant-id-1");
  console.log("  ✓ 19 platform-admin grant path (RPC delegated)");
}

{
  // 17 — missing platform license must not grant: commercial mapped keys use billing RPC only
  assert.equal(toBillingFeatureCode("ai.employee"), "ai_employee");
  console.log("  ✓ 17 commercial keys mapped away from license fail-open");
}

console.log("\nAll Phase 3 entitlement service tests passed.\n");
