/**
 * Company Feature Groups ↔ atomic RBAC permissions.
 * Commercial feature_definitions remain the company assignment SoT.
 * This layer only maps groups → permission codes for UI + grant filtering.
 */

export type FeaturePermissionRow = {
  feature_code: string;
  permission_code: string;
  is_active?: boolean | null;
};

/** Build feature_code → permission_code[] from mapping rows. */
export function groupPermissionsByFeature(
  rows: readonly FeaturePermissionRow[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    if (row.is_active === false) continue;
    const feature = row.feature_code?.trim();
    const permission = row.permission_code?.trim();
    if (!feature || !permission) continue;
    const list = map.get(feature) ?? [];
    list.push(permission);
    map.set(feature, list);
  }
  for (const [feature, list] of map) {
    map.set(feature, [...new Set(list)].sort());
  }
  return map;
}

/**
 * A permission is company-available when:
 * - Super Admin, or
 * - it has no feature mapping (ungated), or
 * - at least one mapped feature is enabled for the company.
 */
export function isPermissionAvailableForCompany(
  permissionCode: string,
  options: {
    isSuperAdmin: boolean;
    featurePermissions: Map<string, string[]>;
    isFeatureEnabled: (featureCode: string) => boolean;
  },
): boolean {
  if (options.isSuperAdmin) return true;
  const code = permissionCode.trim();
  if (!code) return false;

  const mappedFeatures: string[] = [];
  for (const [feature, permissions] of options.featurePermissions) {
    if (permissions.includes(code)) mappedFeatures.push(feature);
  }
  if (mappedFeatures.length === 0) return true;
  return mappedFeatures.some((feature) => options.isFeatureEnabled(feature) === true);
}

export function filterPermissionsAvailableForCompany<T extends { code?: string | null }>(
  permissions: readonly T[],
  options: {
    isSuperAdmin: boolean;
    featurePermissions: Map<string, string[]>;
    isFeatureEnabled: (featureCode: string) => boolean;
  },
): T[] {
  if (options.isSuperAdmin) return [...permissions];
  return permissions.filter((permission) => {
    const code = permission.code;
    return Boolean(
      code &&
        isPermissionAvailableForCompany(code, options),
    );
  });
}

export function assertPermissionsAvailableForCompany(
  requestedCodes: readonly string[],
  options: {
    isSuperAdmin: boolean;
    featurePermissions: Map<string, string[]>;
    isFeatureEnabled: (featureCode: string) => boolean;
  },
): void {
  if (options.isSuperAdmin) return;
  const denied = requestedCodes.filter(
    (code) => !isPermissionAvailableForCompany(code, options),
  );
  if (denied.length > 0) {
    throw new Error(`company_feature_permission_denied:${denied.join(",")}`);
  }
}
