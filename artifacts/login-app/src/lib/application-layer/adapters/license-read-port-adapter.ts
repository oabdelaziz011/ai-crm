import type { SupabaseClient } from "@supabase/supabase-js";
import type { LicenseReadPort } from "@workspace/application-layer";
import {
  licensingEngine,
  type CompanyLicenseState,
  type LicenseQuotaKey,
  type PlanEntitlements,
} from "@workspace/configuration-platform";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";
import { toBillingFeatureCode } from "@/lib/billing/feature-code-map";

type LicenseRow = {
  tenant_id: string;
  plan_code: string;
  status: string;
  trial_ends_at: string | null;
  expires_at: string | null;
  grace_ends_at: string | null;
  add_ons: string[] | null;
};

type EntitlementRow = {
  plan_code: string;
  features: Record<string, boolean>;
  limits: Record<string, number>;
  modules: string[];
};

function mapLicense(row: LicenseRow): CompanyLicenseState {
  return Object.freeze({
    tenantId: String(row.tenant_id),
    planCode: String(row.plan_code),
    status: row.status as CompanyLicenseState["status"],
    trialEndsAt: row.trial_ends_at,
    expiresAt: row.expires_at,
    graceEndsAt: row.grace_ends_at,
    addOns: Object.freeze(Array.isArray(row.add_ons) ? row.add_ons : []),
  });
}

function mapEntitlements(row: EntitlementRow): PlanEntitlements {
  return Object.freeze({
    planCode: String(row.plan_code),
    features: Object.freeze({ ...(row.features ?? {}) }),
    limits: Object.freeze({ ...(row.limits ?? {}) }),
    modules: Object.freeze(Array.isArray(row.modules) ? row.modules : []),
  });
}

function canRead(ctx: LoginAppPortContext): boolean {
  if (ctx.isSuperAdmin) return true;
  return (
    ctx.hasPermission("licenses.read") ||
    ctx.hasPermission("configuration.read") ||
    ctx.hasPermission("feature_flags.read")
  );
}

export function createLoginAppLicenseReadPort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): LicenseReadPort {
  return {
    async getCompanyLicense(tenantId) {
      if (tenantId !== ctx.companyId || !canRead(ctx)) return null;

      const { data, error } = await client
        .from("platform_company_licenses")
        .select("tenant_id, plan_code, status, trial_ends_at, expires_at, grace_ends_at, add_ons")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (error || !data) return null;
      return mapLicense(data as LicenseRow);
    },

    async getPlanEntitlements(planCode) {
      const { data, error } = await client
        .from("platform_plan_entitlements")
        .select("plan_code, features, limits, modules")
        .eq("plan_code", planCode)
        .maybeSingle();

      if (error || !data) return null;
      return mapEntitlements(data as EntitlementRow);
    },

    async canAccess(tenantId, featureKey) {
      // Mapped commercial keys → Phase 6 billing entitlement SoT only.
      // LicensingEngine must NEVER authorize mapped commercial features.
      const billingCode = toBillingFeatureCode(featureKey);
      if (billingCode) {
        if (tenantId !== ctx.companyId && !ctx.isSuperAdmin) {
          return Object.freeze({
            allowed: false,
            reason: "Tenant mismatch",
            planCode: "billing",
            status: "suspended" as const,
          });
        }

        const { data, error } = await client.rpc("is_feature_enabled", {
          p_company_id: tenantId,
          p_feature_code: billingCode,
        });

        if (error) {
          return Object.freeze({
            allowed: false,
            reason: error.message,
            planCode: "billing",
            status: "expired" as const,
          });
        }

        const allowed = Boolean(data);
        return Object.freeze({
          allowed,
          reason: allowed ? undefined : `Company not entitled to ${billingCode}`,
          planCode: "billing",
          status: (allowed ? "active" : "expired") as CompanyLicenseState["status"],
        });
      }

      // Unmapped legacy keys only: LicensingEngine for quotas / legacy JSON features.
      // Examples: knowledge.platform, embeddings, tool.calling — not in BILLING_FEATURE_CODES.
      const state = await this.getCompanyLicense(tenantId);
      if (!state) {
        return Object.freeze({
          allowed: false,
          reason: "No license configured",
          planCode: "unknown",
          status: "expired" as const,
        });
      }

      const entitlements = (await this.getPlanEntitlements(state.planCode)) ?? {
        planCode: state.planCode,
        features: {},
        limits: {},
        modules: [],
      };

      return licensingEngine.canAccess(featureKey, entitlements, state);
    },

    async getQuota(tenantId, quotaKey: LicenseQuotaKey) {
      const state = await this.getCompanyLicense(tenantId);
      if (!state) return 0;

      const entitlements = (await this.getPlanEntitlements(state.planCode)) ?? {
        planCode: state.planCode,
        features: {},
        limits: {},
        modules: [],
      };

      return licensingEngine.getQuota(quotaKey, entitlements, state);
    },
  };
}
