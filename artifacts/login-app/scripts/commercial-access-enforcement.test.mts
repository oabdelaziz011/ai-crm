/**
 * Phase 6 commercial access matrix (pure + route gate).
 * Run: node --experimental-strip-types artifacts/login-app/scripts/commercial-access-enforcement.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getCompanyAccessState,
  isFeatureEnabledPure,
  type CompanyAccessInput,
  type FeatureDefinitionLike,
  type FeatureGrantLike,
} from "../src/lib/billing/commercial-entitlement-resolver.ts";
import {
  composeEffectiveFeatureAccess,
  isCommercialRouteEntitlementAllowed,
} from "../src/lib/billing/company-feature-access.ts";

// Inline mirror of commercial clause in isDashboardRoutePermitted (avoid importing full route registry).
function commercialRouteAllowed(
  hasRbac: boolean,
  commercialEnabled: boolean | undefined,
  isSuperAdmin = false,
): boolean {
  if (isSuperAdmin) return true;
  if (!hasRbac) return false;
  return isCommercialRouteEntitlementAllowed(commercialEnabled);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const migration266 = join(
  __dirname,
  "../../../supabase/migrations/266_commercial_access_enforcement.sql",
);
const migration306 = join(
  __dirname,
  "../../../supabase/migrations/306_fix_commercial_approval_access_gate.sql",
);

console.log("\nPhase 6 commercial access enforcement\n");

const sql = readFileSync(migration266, "utf8");
assert.match(sql, /approval_status is distinct from 'approved'/);
assert.match(sql, /require_company_feature_v1/);
assert.doesNotMatch(sql, /create table.*product_features/i);
console.log("  ✓ migration 266 approval gate present");

const sql306 = readFileSync(migration306, "utf8");
assert.match(sql306, /create or replace function internal\.is_feature_enabled/);
assert.match(sql306, /v_commercial and v_approval_status is distinct from 'approved'/);
assert.match(sql306, /create or replace function internal\.get_company_access_state/);
assert.doesNotMatch(sql306, /create or replace function public\.is_feature_enabled/);
assert.doesNotMatch(sql306, /sync_company_package_entitlements/);
console.log("  ✓ migration 306 restores internal approval gate only");

const WHATSAPP: FeatureDefinitionLike = {
  code: "whatsapp_channel",
  defaultEnabled: false,
  isBillable: true,
  requiresSubscription: true,
};
const CORE: FeatureDefinitionLike = {
  code: "core_crm",
  defaultEnabled: true,
  isBillable: false,
  requiresSubscription: false,
};
const now = new Date("2026-08-14T12:00:00Z");
const future = new Date("2026-09-01T12:00:00Z");
const past = new Date("2026-07-01T12:00:00Z");

function company(partial: Partial<CompanyAccessInput>): CompanyAccessInput {
  return {
    exists: true,
    status: "Active",
    approvalStatus: "approved",
    subscriptionStatus: "active",
    subscriptionExpiresAt: null,
    subscriptionRow: null,
    ...partial,
  };
}

function grant(
  partial: Partial<FeatureGrantLike> & Pick<FeatureGrantLike, "featureCode">,
): FeatureGrantLike {
  return {
    overrideState: "enabled",
    source: "manual",
    startsAt: past,
    expiresAt: null,
    isActive: true,
    ...partial,
  };
}

assert.equal(
  composeEffectiveFeatureAccess({
    isSuperAdmin: true,
    hasRbacPermission: false,
    companyFeatureEnabled: false,
    entitlementResolved: false,
  }),
  true,
);
console.log("  ✓ G super-admin bypass unchanged (RBAC/entitlement not required)");

// A approved + entitlement + RBAC
assert.equal(
  composeEffectiveFeatureAccess({
    hasRbacPermission: true,
    companyFeatureEnabled: true,
    entitlementResolved: true,
  }),
  true,
);
console.log("  ✓ A allow when approved+entitlement+RBAC");

// B approved + no entitlement + RBAC
assert.equal(
  composeEffectiveFeatureAccess({
    hasRbacPermission: true,
    companyFeatureEnabled: false,
    entitlementResolved: true,
  }),
  false,
);
console.log("  ✓ B deny without entitlement");

// C approved + entitlement + no RBAC
assert.equal(
  composeEffectiveFeatureAccess({
    hasRbacPermission: false,
    companyFeatureEnabled: true,
    entitlementResolved: true,
  }),
  false,
);
console.log("  ✓ C deny without RBAC");

// D flag disabled
assert.equal(
  composeEffectiveFeatureAccess({
    hasRbacPermission: true,
    companyFeatureEnabled: true,
    runtimeFlagEnabled: false,
    entitlementResolved: true,
  }),
  false,
);
console.log("  ✓ D deny when kill-switch off");

// E pending + entitlement grant
assert.equal(
  isFeatureEnabledPure({
    company: company({ approvalStatus: "pending", status: "Trial", subscriptionStatus: "trialing" }),
    feature: WHATSAPP,
    grant: grant({ featureCode: "whatsapp_channel", source: "trial", expiresAt: future }),
    now,
  }),
  false,
);
console.log("  ✓ E pending denies commercial even with grant");

// F rejected
assert.equal(
  isFeatureEnabledPure({
    company: company({ approvalStatus: "rejected" }),
    feature: WHATSAPP,
    grant: grant({ featureCode: "whatsapp_channel" }),
    now,
  }),
  false,
);
console.log("  ✓ F rejected denies commercial");

// G suspended
assert.equal(
  isFeatureEnabledPure({
    company: company({ status: "Suspended" }),
    feature: WHATSAPP,
    grant: grant({ featureCode: "whatsapp_channel" }),
    now,
  }),
  false,
);
assert.equal(getCompanyAccessState(company({ status: "Suspended" }), now), "suspended");
console.log("  ✓ G suspended denies commercial");

// H trial + active trial grant
assert.equal(
  isFeatureEnabledPure({
    company: company({
      status: "Trial",
      subscriptionStatus: "trialing",
      subscriptionRow: { status: "trialing", trialEndsAt: future, currentPeriodEnd: null },
    }),
    feature: WHATSAPP,
    grant: grant({ featureCode: "whatsapp_channel", source: "trial", expiresAt: future }),
    now,
  }),
  true,
);
console.log("  ✓ H trial + active trial grant allows");

// I expired trial grant
assert.equal(
  isFeatureEnabledPure({
    company: company({
      status: "Trial",
      subscriptionStatus: "trialing",
      subscriptionRow: { status: "trialing", trialEndsAt: past, currentPeriodEnd: null },
    }),
    feature: WHATSAPP,
    grant: grant({ featureCode: "whatsapp_channel", source: "trial", expiresAt: past }),
    now,
  }),
  false,
);
console.log("  ✓ I expired trial grant denies");

// J trial expired + manual grant survives
assert.equal(
  isFeatureEnabledPure({
    company: company({
      status: "Trial",
      subscriptionStatus: "expired",
      subscriptionRow: { status: "expired", trialEndsAt: past, currentPeriodEnd: null },
    }),
    feature: WHATSAPP,
    grant: grant({ featureCode: "whatsapp_channel", source: "manual", expiresAt: null }),
    now,
  }),
  true,
);
console.log("  ✓ J manual grant survives trial expiry");

// K contract grant
assert.equal(
  isFeatureEnabledPure({
    company: company({
      status: "Trial",
      subscriptionStatus: "expired",
      subscriptionRow: { status: "expired", trialEndsAt: past, currentPeriodEnd: null },
    }),
    feature: WHATSAPP,
    grant: grant({ featureCode: "whatsapp_channel", source: "contract" }),
    now,
  }),
  true,
);
console.log("  ✓ K contract grant survives trial expiry");

// L core CRM intact for approved
assert.equal(
  isFeatureEnabledPure({
    company: company({ approvalStatus: "approved" }),
    feature: CORE,
    grant: null,
    now,
  }),
  true,
);
// pending can still use core
assert.equal(
  isFeatureEnabledPure({
    company: company({ approvalStatus: "pending", status: "Trial" }),
    feature: CORE,
    grant: null,
    now,
  }),
  true,
);
console.log("  ✓ L core CRM intact (including pending)");

// M/N route gate
assert.equal(commercialRouteAllowed(true, true), true);
assert.equal(commercialRouteAllowed(true, false), false);
assert.equal(commercialRouteAllowed(true, undefined), false);
assert.equal(commercialRouteAllowed(false, true), false);
assert.equal(isCommercialRouteEntitlementAllowed(undefined), false);
assert.equal(isCommercialRouteEntitlementAllowed(false), false);
assert.equal(isCommercialRouteEntitlementAllowed(true), true);
console.log("  ✓ M/N/P route + fail-closed loading");

// Per-channel isolation conceptually
assert.equal(
  isFeatureEnabledPure({
    company: company({}),
    feature: WHATSAPP,
    grant: grant({ featureCode: "whatsapp_channel" }),
    now,
  }),
  true,
);
const FACEBOOK: FeatureDefinitionLike = {
  code: "facebook_channel",
  defaultEnabled: false,
  isBillable: true,
  requiresSubscription: true,
};
assert.equal(
  isFeatureEnabledPure({
    company: company({}),
    feature: FACEBOOK,
    grant: null,
    now,
  }),
  false,
);
console.log("  ✓ per-channel: WhatsApp grant does not unlock Facebook");

// Package-sourced grants behave like manual/contract (survive commercial expiry)
assert.equal(
  isFeatureEnabledPure({
    company: company({
      status: "Trial",
      subscriptionStatus: "expired",
      subscriptionExpiresAt: past,
    }),
    feature: WHATSAPP,
    grant: grant({ featureCode: "whatsapp_channel", source: "package" }),
  }),
  true,
);
console.log("  ✓ package grant survives commercial/trial expiry (unlike trial grants)");

console.log("\nPhase 6 access matrix (static) passed\n");
