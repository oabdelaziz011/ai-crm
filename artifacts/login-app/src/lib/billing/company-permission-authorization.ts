/**
 * Product runtime authorization boundary:
 *   RBAC permission (user_has_permission / hasPermission)
 *     AND
 *   company feature availability (permission_available_to_company)
 *
 * Keeps user_has_permission / hasPermission as RBAC-only primitives.
 * Commercial feature route gates (is_feature_enabled) remain separate.
 */

import { isPermissionAvailableForCompany } from "./feature-definition-permissions";

export class CompanyPermissionDeniedError extends Error {
  readonly code = "COMPANY_PERMISSION_DENIED";
  readonly permissionCode: string;

  constructor(permissionCode: string, message?: string) {
    super(message ?? `Permission "${permissionCode}" is not authorized for this company`);
    this.name = "CompanyPermissionDeniedError";
    this.permissionCode = permissionCode;
  }
}

export type CompanyPermissionAuthOptions = {
  isSuperAdmin: boolean;
  /** RBAC-only checker (must NOT include commercial gates). */
  hasRbacPermission: (permissionCode: string) => boolean;
  /** Company capability for a permission code (mapped → feature enabled). */
  isPermissionAvailable: (permissionCode: string) => boolean;
};

/**
 * Actual product authorization: RBAC ∩ company feature availability.
 * Super Admin bypasses both (matches permission_available_to_company / is_super_admin).
 */
export function hasCompanyPermission(
  permissionCode: string,
  options: CompanyPermissionAuthOptions,
): boolean {
  if (options.isSuperAdmin) return true;
  const code = permissionCode.trim();
  if (!code) return false;
  return (
    options.hasRbacPermission(code) && options.isPermissionAvailable(code)
  );
}

export function requireCompanyPermission(
  permissionCode: string,
  options: CompanyPermissionAuthOptions,
): void {
  if (!hasCompanyPermission(permissionCode, options)) {
    throw new CompanyPermissionDeniedError(permissionCode);
  }
}

/**
 * Wrap an RBAC-only hasPermission into the product authorization checker.
 * Cross-company evaluation is the caller's responsibility (companyId on context).
 */
export function createCompanyPermissionChecker(
  options: CompanyPermissionAuthOptions,
): (permissionCode: string) => boolean {
  return (permissionCode: string) => hasCompanyPermission(permissionCode, options);
}

/**
 * Build isPermissionAvailable from the feature↔permission map + entitlement lookup.
 * Fail-closed while `isReady` is false (loading/unknown).
 */
export function createPermissionAvailabilityChecker(input: {
  isSuperAdmin: boolean;
  isReady: boolean;
  featurePermissions: Map<string, string[]>;
  isFeatureEnabled: (featureCode: string) => boolean;
}): (permissionCode: string) => boolean {
  return (permissionCode: string) => {
    if (input.isSuperAdmin) return true;
    if (!input.isReady) return false;
    return isPermissionAvailableForCompany(permissionCode, {
      isSuperAdmin: false,
      featurePermissions: input.featurePermissions,
      isFeatureEnabled: input.isFeatureEnabled,
    });
  };
}
