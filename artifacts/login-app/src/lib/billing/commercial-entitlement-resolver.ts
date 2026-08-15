/**
 * Pure TypeScript mirror of migration 263 commercial entitlement resolver.
 * Kept in sync with public.is_feature_enabled / get_company_access_state.
 * Used for unit tests without a live database.
 */

export type FeatureDefinitionLike = Readonly<{
  code: string;
  defaultEnabled: boolean;
  isBillable: boolean;
  requiresSubscription: boolean;
  isActive?: boolean;
}>;

export type FeatureGrantLike = Readonly<{
  featureCode: string;
  overrideState: "enabled" | "disabled";
  source: "trial" | "manual" | "contract" | "system" | "package";
  startsAt: Date;
  expiresAt: Date | null;
  isActive: boolean;
}>;

export type CompanyAccessInput = Readonly<{
  exists: boolean;
  status: "Active" | "Suspended" | "Trial";
  /** Phase 5/6 approval. Missing treated as approved for legacy rows. */
  approvalStatus?: "pending" | "approved" | "rejected" | null;
  subscriptionStatus: string | null;
  subscriptionExpiresAt: Date | null;
  subscriptionRow: Readonly<{
    status: string;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
  }> | null;
}>;

export function isCompanyCommerciallyApproved(
  company: Pick<CompanyAccessInput, "approvalStatus">,
): boolean {
  const status = company.approvalStatus ?? "approved";
  return status === "approved";
}

export function isFeatureCommerciallyGated(feature: FeatureDefinitionLike): boolean {
  return feature.isBillable || feature.requiresSubscription;
}

export function isCompanyCommerciallyExpired(company: CompanyAccessInput, now: Date): boolean {
  if (!company.exists) return true;
  if (company.status === "Suspended") return false;
  if (company.subscriptionStatus === "expired") return true;

  const cs = company.subscriptionRow;
  if (cs) {
    if (cs.status === "expired") return true;
    if (cs.status === "trialing" && cs.trialEndsAt && cs.trialEndsAt.getTime() <= now.getTime()) {
      return true;
    }
    if (
      cs.status === "canceled" &&
      cs.currentPeriodEnd &&
      cs.currentPeriodEnd.getTime() <= now.getTime()
    ) {
      return true;
    }
    return false;
  }

  if (
    company.status === "Trial" &&
    company.subscriptionStatus === "trialing" &&
    company.subscriptionExpiresAt &&
    company.subscriptionExpiresAt.getTime() <= now.getTime()
  ) {
    return true;
  }
  return company.subscriptionStatus === "expired";
}

export function getCompanyAccessState(company: CompanyAccessInput, now: Date): string {
  if (!company.exists) return "expired";
  if (!isCompanyCommerciallyApproved(company)) return "expired";
  if (company.status === "Suspended") return "suspended";
  if (isCompanyCommerciallyExpired(company, now)) return "expired";

  const csStatus = company.subscriptionRow?.status ?? company.subscriptionStatus;
  if (csStatus === "trialing" || company.status === "Trial") return "trial";
  if (company.status === "Active" || csStatus === "active") return "active";
  if (csStatus === "past_due" || csStatus === "grace_period") return "active";
  return "active";
}

export function isFeatureEnabledPure(input: {
  company: CompanyAccessInput;
  feature: FeatureDefinitionLike | null;
  grant: FeatureGrantLike | null;
  killSwitchEnabled?: boolean | null;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  const { company, feature, grant } = input;

  if (!company.exists || !feature || feature.isActive === false) return false;

  if (input.killSwitchEnabled === false) return false;

  const commercial = isFeatureCommerciallyGated(feature);
  if (commercial && !isCompanyCommerciallyApproved(company)) return false;
  if (company.status === "Suspended" && commercial) return false;

  const inWindow =
    grant &&
    grant.isActive &&
    grant.startsAt.getTime() <= now.getTime() &&
    (grant.expiresAt == null || grant.expiresAt.getTime() > now.getTime());

  if (inWindow && grant) {
    if (grant.overrideState === "disabled") return false;
    if (grant.overrideState === "enabled") {
      if (grant.source === "trial" && isCompanyCommerciallyExpired(company, now)) {
        return false;
      }
      return true;
    }
  }

  if (commercial) return false;
  return feature.defaultEnabled;
}
