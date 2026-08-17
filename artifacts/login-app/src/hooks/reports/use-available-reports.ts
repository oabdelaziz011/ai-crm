import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import { useCommercialFeatureLookup } from "@/hooks/billing/use-commercial-feature-lookup";
import {
  filterAvailableReports,
  resolveSelectedReportId,
  type ReportAccessContext,
} from "@/lib/reports/report-access";
import type { ReportDefinition, ReportId } from "@/lib/reports/report-catalog";

export function useAvailableReports(selectedReportId?: string | null): {
  available: ReportDefinition[];
  selectedId: ReportId | null;
  selected: ReportDefinition | null;
  isLoading: boolean;
  access: ReportAccessContext;
} {
  const { isSuperAdmin } = useAuth();
  const { hasCompanyPermission } = useCompanyPermissionAuth();
  const canViewReportsHub = isSuperAdmin || hasCompanyPermission("reports.view");
  const { lookup, isLoading, isResolved } = useCommercialFeatureLookup();

  const access: ReportAccessContext = useMemo(
    () => ({
      isSuperAdmin,
      hasPermission: hasCompanyPermission,
      isModuleEnabled: lookup,
      canViewReportsHub,
    }),
    [canViewReportsHub, hasCompanyPermission, isSuperAdmin, lookup],
  );

  const available = useMemo(() => {
    if (!isResolved && !isSuperAdmin) return [];
    return filterAvailableReports(access);
  }, [access, isResolved, isSuperAdmin]);

  const selectedId = useMemo(
    () => resolveSelectedReportId(selectedReportId, available),
    [available, selectedReportId],
  );

  const selected = useMemo(
    () => available.find((r) => r.id === selectedId) ?? null,
    [available, selectedId],
  );

  return {
    available,
    selectedId,
    selected,
    isLoading: isLoading && !isSuperAdmin,
    access,
  };
}
