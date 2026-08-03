import type { LicenseQuotaKey, LicenseStatus } from "./constants.js";

export type PlanEntitlements = Readonly<{
  planCode: string;
  features: Readonly<Record<string, boolean>>;
  limits: Readonly<Partial<Record<LicenseQuotaKey, number>>>;
  modules: readonly string[];
}>;

export type CompanyLicenseState = Readonly<{
  tenantId: string;
  planCode: string;
  status: LicenseStatus;
  trialEndsAt: string | null;
  expiresAt: string | null;
  graceEndsAt: string | null;
  addOns: readonly string[];
}>;

export type LicenseAccessContext = Readonly<{
  now?: Date;
}>;

export type LicenseAccessResult = Readonly<{
  allowed: boolean;
  reason?: string;
  planCode: string;
  status: LicenseStatus;
}>;

function isLicenseActive(state: CompanyLicenseState, now: Date): boolean {
  if (state.status === "suspended" || state.status === "expired") return false;
  if (state.status === "trial" && state.trialEndsAt && new Date(state.trialEndsAt) <= now) return false;
  if (state.status === "grace" && state.graceEndsAt && new Date(state.graceEndsAt) <= now) return false;
  if (state.expiresAt && new Date(state.expiresAt) <= now && state.status !== "grace") return false;
  return true;
}

export class LicensingEngine {
  canAccess(
    featureKey: string,
    entitlements: PlanEntitlements,
    state: CompanyLicenseState,
    ctx: LicenseAccessContext = {},
  ): LicenseAccessResult {
    const now = ctx.now ?? new Date();

    if (!isLicenseActive(state, now)) {
      return Object.freeze({
        allowed: false,
        reason: `License ${state.status}`,
        planCode: state.planCode,
        status: state.status,
      });
    }

    if (state.addOns.includes(featureKey)) {
      return Object.freeze({ allowed: true, planCode: state.planCode, status: state.status });
    }

    const allowed = entitlements.features[featureKey] === true;
    return Object.freeze({
      allowed,
      reason: allowed ? undefined : `Plan ${state.planCode} does not include ${featureKey}`,
      planCode: state.planCode,
      status: state.status,
    });
  }

  getQuota(
    quotaKey: LicenseQuotaKey,
    entitlements: PlanEntitlements,
    state: CompanyLicenseState,
  ): number | null {
    if (!isLicenseActive(state, new Date())) return 0;
    const limit = entitlements.limits[quotaKey];
    return limit ?? null;
  }

  isModuleEnabled(moduleKey: string, entitlements: PlanEntitlements, state: CompanyLicenseState): boolean {
    if (!isLicenseActive(state, new Date())) return false;
    return entitlements.modules.includes(moduleKey) || entitlements.modules.includes("*");
  }
}

export const licensingEngine = new LicensingEngine();
