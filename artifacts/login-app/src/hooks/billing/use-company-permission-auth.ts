import { useCallback, useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { useCompanyFeaturePermissionGate } from "@/hooks/billing/use-feature-definition-permissions";
import {
  createCompanyPermissionChecker,
  createPermissionAvailabilityChecker,
  hasCompanyPermission,
  requireCompanyPermission,
} from "@/lib/billing/company-permission-authorization";
import type { LoginAppPortContext } from "@/lib/application-layer/adapters/customer-read-port-adapter";

/**
 * Product authorization hook: RBAC ∩ company feature availability.
 * Leaves useAuthUser().hasPermission as RBAC-only.
 */
export function useCompanyPermissionAuth() {
  const { company } = useAuth();
  const { hasPermission: hasRbacPermission, isSuperAdmin, user } = useAuthUser();
  const gate = useCompanyFeaturePermissionGate(company?.id ?? null);

  const isReady = isSuperAdmin || !company?.id || !gate.isLoading;

  const isPermissionAvailable = useMemo(
    () =>
      createPermissionAvailabilityChecker({
        isSuperAdmin,
        isReady,
        featurePermissions: gate.featurePermissions,
        isFeatureEnabled: gate.isFeatureEnabled,
      }),
    [isSuperAdmin, isReady, gate.featurePermissions, gate.isFeatureEnabled],
  );

  const hasProductPermission = useMemo(
    () =>
      createCompanyPermissionChecker({
        isSuperAdmin,
        hasRbacPermission,
        isPermissionAvailable,
      }),
    [isSuperAdmin, hasRbacPermission, isPermissionAvailable],
  );

  const requireProductPermission = useCallback(
    (permissionCode: string) => {
      requireCompanyPermission(permissionCode, {
        isSuperAdmin,
        hasRbacPermission,
        isPermissionAvailable,
      });
    },
    [isSuperAdmin, hasRbacPermission, isPermissionAvailable],
  );

  const buildPortContext = useCallback((): LoginAppPortContext => {
    if (!company?.id || !user?.id) {
      throw new Error("Not authenticated");
    }
    return {
      companyId: company.id,
      actorUserId: user.id,
      isSuperAdmin,
      // Product boundary: ports/services use company-gated checker
      hasPermission: hasProductPermission,
    };
  }, [company?.id, user?.id, isSuperAdmin, hasProductPermission]);

  return {
    user,
    companyId: company?.id ?? null,
    isSuperAdmin,
    isReady,
    isLoading: gate.isLoading,
    /** RBAC-only (unchanged primitive). */
    hasRbacPermission,
    /** Product auth: RBAC ∩ company feature availability. */
    hasCompanyPermission: hasProductPermission,
    isPermissionAvailable,
    requireCompanyPermission: requireProductPermission,
    buildPortContext,
    /** Evaluate without closing over latest checker (tests / one-offs). */
    evaluate: (permissionCode: string) =>
      hasCompanyPermission(permissionCode, {
        isSuperAdmin,
        hasRbacPermission,
        isPermissionAvailable,
      }),
  };
}
