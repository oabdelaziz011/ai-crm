import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import { useCommercialFeatureLookup } from "@/hooks/billing/use-commercial-feature-lookup";
import type { CustomerProfileTab } from "@/components/customer-profile/types";
import type { WorkspaceTopTab } from "@/lib/customer-workspace/workspace-navigation";
import {
  buildCustomerAuditModuleAccess,
  filterAccessibleWorkspaceTabs,
  isActivitySourceAccessible,
  isProfileTabAccessible,
  isQuickActionAllowed,
  isWorkspaceTabAccessible,
  resolveAccessibleProfileTab,
  type CustomerAuditModuleAccess,
  type CustomerWorkspaceAccessContext,
  type CustomerWorkspaceQuickAction,
} from "@/lib/customer-workspace/workspace-feature-access";

export function useCustomerWorkspaceAccess(activeTab?: CustomerProfileTab): {
  access: CustomerWorkspaceAccessContext;
  accessibleTabs: WorkspaceTopTab[];
  isTabAccessible: (tab: WorkspaceTopTab) => boolean;
  isProfileTabAccessible: (tab: CustomerProfileTab) => boolean;
  isQuickActionAllowed: (action: CustomerWorkspaceQuickAction) => boolean;
  isActivitySourceAccessible: (sourceId: string) => boolean;
  auditModuleAccess: CustomerAuditModuleAccess;
  resolvedTab: CustomerProfileTab;
  redirectTab: CustomerProfileTab | null;
  isLoading: boolean;
  canAccessBookings: boolean;
  canAccessFinance: boolean;
  canAccessTickets: boolean;
  canAccessAi: boolean;
  canAccessCampaigns: boolean;
  canAccessFiles: boolean;
  canAccessWhatsapp: boolean;
} {
  const { isSuperAdmin } = useAuth();
  const { hasCompanyPermission } = useCompanyPermissionAuth();
  const { lookup, isLoading, isResolved } = useCommercialFeatureLookup();

  const access: CustomerWorkspaceAccessContext = useMemo(
    () => ({
      isSuperAdmin,
      hasPermission: hasCompanyPermission,
      isModuleEnabled: lookup,
      entitlementResolved: isResolved || isSuperAdmin,
    }),
    [hasCompanyPermission, isResolved, isSuperAdmin, lookup],
  );

  const accessibleTabs = useMemo(
    () => filterAccessibleWorkspaceTabs(access),
    [access],
  );

  const resolvedTab = useMemo(
    () => resolveAccessibleProfileTab(activeTab, access),
    [access, activeTab],
  );

  const redirectTab = useMemo(() => {
    if (!activeTab || isLoading && !isSuperAdmin) return null;
    if (isProfileTabAccessible(activeTab, access)) return null;
    return resolvedTab;
  }, [access, activeTab, isLoading, isResolved, isSuperAdmin, resolvedTab]);

  const auditModuleAccess = useMemo(
    () => buildCustomerAuditModuleAccess(access),
    [access],
  );

  return {
    access,
    accessibleTabs,
    isTabAccessible: (tab) => isWorkspaceTabAccessible(tab, access),
    isProfileTabAccessible: (tab) => isProfileTabAccessible(tab, access),
    isQuickActionAllowed: (action) => isQuickActionAllowed(action, access),
    isActivitySourceAccessible: (sourceId) => isActivitySourceAccessible(sourceId, access),
    auditModuleAccess,
    resolvedTab,
    redirectTab,
    isLoading: isLoading && !isSuperAdmin,
    canAccessBookings: isWorkspaceTabAccessible("bookings", access),
    canAccessFinance:
      isWorkspaceTabAccessible("invoices", access) ||
      isWorkspaceTabAccessible("payments", access),
    canAccessTickets: isWorkspaceTabAccessible("tickets", access),
    canAccessAi: isWorkspaceTabAccessible("ai", access),
    canAccessCampaigns: isWorkspaceTabAccessible("campaigns", access),
    canAccessFiles: isWorkspaceTabAccessible("files", access),
    canAccessWhatsapp: isQuickActionAllowed("whatsapp", access),
  };
}
