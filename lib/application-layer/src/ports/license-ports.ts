import type {
  CompanyLicenseState,
  LicenseAccessResult,
  PlanEntitlements,
  LicenseQuotaKey,
} from "@workspace/configuration-platform";

export type LicenseAssignInput = Readonly<{
  tenantId: string;
  planCode: string;
  status?: string;
  trialEndsAt?: string | null;
  expiresAt?: string | null;
  graceEndsAt?: string | null;
  addOns?: readonly string[];
  actorId: string;
}>;

export type LicenseReadPort = {
  getCompanyLicense(tenantId: string): Promise<CompanyLicenseState | null>;
  getPlanEntitlements(planCode: string): Promise<PlanEntitlements | null>;
  canAccess(tenantId: string, featureKey: string): Promise<LicenseAccessResult>;
  getQuota(tenantId: string, quotaKey: LicenseQuotaKey): Promise<number | null>;
};

export type LicenseWritePort = {
  assignPlan(input: LicenseAssignInput): Promise<CompanyLicenseState>;
};

export type { CompanyLicenseState, LicenseAccessResult, PlanEntitlements };
