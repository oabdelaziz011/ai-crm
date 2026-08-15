/**
 * Phase 2 commercial entitlements foundation tests.
 * Run: node --experimental-strip-types scripts/commercial-entitlements-foundation.test.mts
 *   or: npx tsx scripts/commercial-entitlements-foundation.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getCompanyAccessState,
  isCompanyCommerciallyExpired,
  isFeatureCommerciallyGated,
  isFeatureEnabledPure,
  type CompanyAccessInput,
  type FeatureDefinitionLike,
  type FeatureGrantLike,
} from "../src/lib/billing/commercial-entitlement-resolver.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  __dirname,
  "../../../supabase/migrations/263_company_commercial_entitlements_foundation.sql",
);

console.log("\nCommercial entitlements foundation (Phase 2)\n");

const sql = readFileSync(migrationPath, "utf8");

assert.match(sql, /263_company_commercial_entitlements_foundation|company commercial entitlements foundation/i);
assert.match(sql, /add column if not exists starts_at/);
assert.match(sql, /add column if not exists source/);
assert.match(sql, /add column if not exists notes/);
assert.match(sql, /check \(source in \('trial', 'manual', 'contract', 'system'\)\)/);
assert.match(sql, /trial_feature_set/);
assert.match(sql, /create or replace function public\.is_feature_enabled/);
assert.match(sql, /create or replace function public\.set_company_feature_grant/);
assert.match(sql, /not public\.is_super_admin\(\)/);
assert.match(sql, /Phase 2 core compatibility backfill/);
assert.match(sql, /fd\.is_billable = false/);
assert.match(sql, /fd\.requires_subscription = false/);
assert.doesNotMatch(sql, /create table.*product_features/i);
assert.doesNotMatch(sql, /create table.*company_feature_entitlements/i);
assert.doesNotMatch(sql, /add constraint companies_status_check[\s\S]*Expired/i);
assert.doesNotMatch(sql, /status in \([^)]*Expired/i);
console.log("  ✓ migration 263 structure + safety guards");

// Existing + expanded classifications mirrored from migration intent
const CORE_CRM: FeatureDefinitionLike = {
  code: "core_crm",
  defaultEnabled: true,
  isBillable: false,
  requiresSubscription: false,
};
const CUSTOMERS: FeatureDefinitionLike = {
  code: "customers",
  defaultEnabled: true,
  isBillable: false,
  requiresSubscription: false,
};
const WHATSAPP: FeatureDefinitionLike = {
  code: "whatsapp_channel",
  defaultEnabled: false,
  isBillable: true,
  requiresSubscription: true,
};
const AI_ASSISTANT: FeatureDefinitionLike = {
  code: "ai_assistant",
  defaultEnabled: false,
  isBillable: true,
  requiresSubscription: true,
};
const BASIC_REPORTS: FeatureDefinitionLike = {
  code: "basic_reports",
  defaultEnabled: false,
  isBillable: true,
  requiresSubscription: true,
};

assert.equal(isFeatureCommerciallyGated(CORE_CRM), false);
assert.equal(isFeatureCommerciallyGated(CUSTOMERS), false);
assert.equal(isFeatureCommerciallyGated(WHATSAPP), true);
assert.equal(isFeatureCommerciallyGated(AI_ASSISTANT), true);
assert.equal(isFeatureCommerciallyGated(BASIC_REPORTS), true);
console.log("  ✓ commercial vs core classification");

const now = new Date("2026-08-14T12:00:00.000Z");

const activeCompany: CompanyAccessInput = {
  exists: true,
  status: "Active",
  subscriptionStatus: "active",
  subscriptionExpiresAt: null,
  subscriptionRow: { status: "active", trialEndsAt: null, currentPeriodEnd: null },
};

const trialCompany: CompanyAccessInput = {
  exists: true,
  status: "Trial",
  subscriptionStatus: "trialing",
  subscriptionExpiresAt: new Date("2026-08-28T12:00:00.000Z"),
  subscriptionRow: {
    status: "trialing",
    trialEndsAt: new Date("2026-08-28T12:00:00.000Z"),
    currentPeriodEnd: new Date("2026-08-28T12:00:00.000Z"),
  },
};

const expiredTrialCompany: CompanyAccessInput = {
  exists: true,
  status: "Trial",
  subscriptionStatus: "trialing",
  subscriptionExpiresAt: new Date("2026-08-01T12:00:00.000Z"),
  subscriptionRow: {
    status: "trialing",
    trialEndsAt: new Date("2026-08-01T12:00:00.000Z"),
    currentPeriodEnd: new Date("2026-08-01T12:00:00.000Z"),
  },
};

const suspendedCompany: CompanyAccessInput = {
  ...activeCompany,
  status: "Suspended",
};

assert.equal(getCompanyAccessState(trialCompany, now), "trial");
assert.equal(getCompanyAccessState(activeCompany, now), "active");
assert.equal(getCompanyAccessState(suspendedCompany, now), "suspended");
assert.equal(isCompanyCommerciallyExpired(expiredTrialCompany, now), true);
assert.equal(getCompanyAccessState(expiredTrialCompany, now), "expired");
console.log("  ✓ access state helper (trial/active/suspended/expired)");

function grant(
  partial: Partial<FeatureGrantLike> & Pick<FeatureGrantLike, "featureCode" | "overrideState" | "source">,
): FeatureGrantLike {
  return {
    startsAt: new Date("2026-08-01T00:00:00.000Z"),
    expiresAt: null,
    isActive: true,
    ...partial,
  };
}

// A — core remains accessible (default or system grant)
assert.equal(
  isFeatureEnabledPure({ company: activeCompany, feature: CORE_CRM, grant: null, now }),
  true,
);
assert.equal(
  isFeatureEnabledPure({
    company: activeCompany,
    feature: CORE_CRM,
    grant: grant({ featureCode: "core_crm", overrideState: "enabled", source: "system" }),
    now,
  }),
  true,
);
console.log("  ✓ A core accessible");

// B — paid with no override denied
assert.equal(
  isFeatureEnabledPure({ company: activeCompany, feature: WHATSAPP, grant: null, now }),
  false,
);
console.log("  ✓ B paid without grant denied");

// C — commercial enabled grant allowed
assert.equal(
  isFeatureEnabledPure({
    company: activeCompany,
    feature: WHATSAPP,
    grant: grant({ featureCode: "whatsapp_channel", overrideState: "enabled", source: "contract" }),
    now,
  }),
  true,
);
console.log("  ✓ C commercial grant allowed");

// D — disabled grant denied
assert.equal(
  isFeatureEnabledPure({
    company: activeCompany,
    feature: WHATSAPP,
    grant: grant({ featureCode: "whatsapp_channel", overrideState: "disabled", source: "manual" }),
    now,
  }),
  false,
);
console.log("  ✓ D disabled grant denied");

// E — before starts_at denied
assert.equal(
  isFeatureEnabledPure({
    company: activeCompany,
    feature: WHATSAPP,
    grant: grant({
      featureCode: "whatsapp_channel",
      overrideState: "enabled",
      source: "manual",
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
    }),
    now,
  }),
  false,
);
console.log("  ✓ E before starts_at denied");

// F — after expires_at denied
assert.equal(
  isFeatureEnabledPure({
    company: activeCompany,
    feature: WHATSAPP,
    grant: grant({
      featureCode: "whatsapp_channel",
      overrideState: "enabled",
      source: "manual",
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
    }),
    now,
  }),
  false,
);
console.log("  ✓ F after expires_at denied");

// G — trial grant after trial expiration denied
assert.equal(
  isFeatureEnabledPure({
    company: expiredTrialCompany,
    feature: WHATSAPP,
    grant: grant({
      featureCode: "whatsapp_channel",
      overrideState: "enabled",
      source: "trial",
      expiresAt: new Date("2026-12-01T00:00:00.000Z"),
    }),
    now,
  }),
  false,
);
console.log("  ✓ G trial grant after commercial expiry denied");

// H — manual survives trial expiry
assert.equal(
  isFeatureEnabledPure({
    company: expiredTrialCompany,
    feature: WHATSAPP,
    grant: grant({
      featureCode: "whatsapp_channel",
      overrideState: "enabled",
      source: "manual",
      expiresAt: new Date("2026-12-01T00:00:00.000Z"),
    }),
    now,
  }),
  true,
);
console.log("  ✓ H manual survives trial expiry");

// I — contract survives trial expiry
assert.equal(
  isFeatureEnabledPure({
    company: expiredTrialCompany,
    feature: AI_ASSISTANT,
    grant: grant({
      featureCode: "ai_assistant",
      overrideState: "enabled",
      source: "contract",
      expiresAt: null,
    }),
    now,
  }),
  true,
);
console.log("  ✓ I contract survives trial expiry");

// J — suspended blocks commercial
assert.equal(
  isFeatureEnabledPure({
    company: suspendedCompany,
    feature: WHATSAPP,
    grant: grant({ featureCode: "whatsapp_channel", overrideState: "enabled", source: "contract" }),
    now,
  }),
  false,
);
console.log("  ✓ J suspended blocks commercial");

// K/L — plan_features / default_enabled alone do not grant commercial
assert.equal(
  isFeatureEnabledPure({
    company: activeCompany,
    feature: { ...WHATSAPP, defaultEnabled: true },
    grant: null,
    now,
  }),
  false,
);
console.log("  ✓ K/L no plan/default fallback for commercial");

// M — core default-enabled compatible
assert.equal(
  isFeatureEnabledPure({ company: activeCompany, feature: CUSTOMERS, grant: null, now }),
  true,
);
console.log("  ✓ M core default-enabled compatible");

// N — documented in migration: grant RPCs require is_super_admin
assert.match(sql, /Insufficient permissions to manage company feature grants/);
assert.match(sql, /set_company_feature_grant/);
assert.match(sql, /revoke_company_feature_grant/);
console.log("  ✓ N grant RPCs require is_super_admin (SQL auth check present)");

console.log("\nAll Phase 2 foundation tests passed.\n");
