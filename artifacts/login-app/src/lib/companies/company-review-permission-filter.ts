import type { CompanyEntitlement } from "@/lib/billing/types";
import type { PermissionRecord } from "@/hooks/use-rbac";

/**
 * Permissions available for assignment when a mapped feature is enabled on the company.
 * Unmapped permission codes remain selectable (matches permission_available_to_company fail-open).
 */
export function filterPermissionsForCompanyEntitlements(
  permissions: readonly PermissionRecord[],
  entitlements: readonly CompanyEntitlement[],
  permissionCodesByFeature: ReadonlyMap<string, readonly string[]>,
): PermissionRecord[] {
  const enabledFeatures = new Set(
    entitlements
      .filter((row) => row.enabled || String((row as { override_state?: string }).override_state ?? "") === "enabled")
      .map((row) => row.feature_code),
  );

  const permissionToFeatures = new Map<string, string[]>();
  for (const [featureCode, codes] of permissionCodesByFeature.entries()) {
    for (const code of codes) {
      const list = permissionToFeatures.get(code) ?? [];
      list.push(featureCode);
      permissionToFeatures.set(code, list);
    }
  }

  return permissions.filter((permission) => {
    const code = permission.code;
    if (!code) return false;
    const mappedFeatures = permissionToFeatures.get(code);
    if (!mappedFeatures || mappedFeatures.length === 0) return true;
    return mappedFeatures.some((featureCode) => enabledFeatures.has(featureCode));
  });
}
