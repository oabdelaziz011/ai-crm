import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { useAuthUser, useHasPermission } from "@/hooks/use-rbac";
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
  const { hasPermission } = useAuthUser();
  const canViewReportsHub = useHasPermission("reports.view") || isSuperAdmin;
  const { lookup, isLoading, isResolved } = useCommercialFeatureLookup();

  const access: ReportAccessContext = useMemo(
    () => ({
      isSuperAdmin,
      hasPermission,
      isModuleEnabled: lookup,
      canViewReportsHub,
    }),
    [canViewReportsHub, hasPermission, isSuperAdmin, lookup],
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
