/**
 * Tenant-facing commercial access contract (Phase 3 / Phase 6).
 * Rich management metadata belongs in admin UI — keep this lean.
 */

export type CompanyFeatureGrantSource = "trial" | "manual" | "contract" | "system" | "package" | "default" | "none";

export type CompanyFeatureAccess = Readonly<{
  featureCode: string;
  enabled: boolean;
  commercial: boolean;
  source?: CompanyFeatureGrantSource | string;
  startsAt?: string | null;
  expiresAt?: string | null;
  reason?: string;
}>;

export type CompanyAccessState = "trial" | "active" | "suspended" | "expired";

/**
 * Compose RBAC + company entitlement (+ optional runtime kill-switch).
 * Does not grant permissions from entitlements.
 *
 * Fail-closed: when entitlementResolved is false (loading/error/unknown),
 * commercial routes must DENY.
 */
export function composeEffectiveFeatureAccess(input: {
  isSuperAdmin?: boolean;
  hasRbacPermission: boolean;
  companyFeatureEnabled: boolean;
  runtimeFlagEnabled?: boolean;
  /** When false, entitlement state is unknown — deny commercial access. */
  entitlementResolved?: boolean;
}): boolean {
  if (input.isSuperAdmin) return true;
  if (!input.hasRbacPermission) return false;
  if (input.runtimeFlagEnabled === false) return false;
  if (input.entitlementResolved === false) return false;
  return input.companyFeatureEnabled;
}

/**
 * Route/sidebar commercial gate (fail closed).
 * `companyFeatureEnabled`:
 *   - true → entitled
 *   - false → not entitled
 *   - undefined → loading/unknown → DENY
 */
export function isCommercialRouteEntitlementAllowed(
  companyFeatureEnabled: boolean | undefined,
): boolean {
  return companyFeatureEnabled === true;
}
