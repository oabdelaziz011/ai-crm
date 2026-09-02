import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import { useCommercialFeatureLookup } from "@/hooks/billing/use-commercial-feature-lookup";
import {
  isActivitySourceAccessible,
  type CustomerWorkspaceAccessContext,
} from "@/lib/customer-workspace/workspace-feature-access";
import type { TimelineAccess } from "@/lib/customer-timeline/types";
import {
  customerTimelineKey,
  customerTimelinePageKey,
  customerProfileMetricsKey,
} from "@/lib/customer-timeline/cache/timeline-query-keys";
import {
  customerTimelineService,
  ensureCustomerTimelineProviders,
} from "@/lib/customer-timeline/timeline-service";
import { fetchCustomerProfileMetrics } from "@/lib/customer-timeline/customer-metrics";
import type {
  CustomerProfileMetrics,
  TimelineFilter,
  TimelineGroupMode,
} from "@/lib/customer-timeline/types";

ensureCustomerTimelineProviders();

function useTimelineAccess(companyId: string | null | undefined): TimelineAccess | undefined {
  const { user, isSuperAdmin } = useAuth();
  const { hasCompanyPermission } = useCompanyPermissionAuth();
  const { lookup, isResolved } = useCommercialFeatureLookup();

  const workspaceCtx: CustomerWorkspaceAccessContext = useMemo(
    () => ({
      isSuperAdmin: Boolean(isSuperAdmin),
      hasPermission: hasCompanyPermission,
      isModuleEnabled: lookup,
      entitlementResolved: isResolved || Boolean(isSuperAdmin),
    }),
    [hasCompanyPermission, isResolved, isSuperAdmin, lookup],
  );

  return useMemo(
    () =>
      user?.id && companyId && (isResolved || isSuperAdmin)
        ? {
            userId: user.id,
            companyId,
            isSuperAdmin: Boolean(isSuperAdmin),
            hasPermission: hasCompanyPermission,
            isModuleEnabled: lookup,
            entitlementResolved: isResolved || Boolean(isSuperAdmin),
            canAccessActivitySource: (sourceId: string) =>
              isActivitySourceAccessible(sourceId, workspaceCtx),
          }
        : undefined,
    [
      companyId,
      hasCompanyPermission,
      isResolved,
      isSuperAdmin,
      lookup,
      user?.id,
      workspaceCtx,
    ],
  );
}

export function useTimelineFilters(initial?: Partial<TimelineFilter>) {
  const [filter, setFilter] = useState<TimelineFilter>({
    legacyFilterId: "all",
    ...initial,
  });
  const [groupMode, setGroupMode] = useState<TimelineGroupMode>("day");

  return {
    filter,
    setFilter,
    groupMode,
    setGroupMode,
    setLegacyFilter: (legacyFilterId: TimelineFilter["legacyFilterId"]) =>
      setFilter((prev) => ({ ...prev, legacyFilterId })),
  };
}

export function useTimelineSearch(initial = "") {
  const [search, setSearch] = useState(initial);
  const debouncedSearch = useMemo(() => search.trim(), [search]);
  return { search, setSearch, debouncedSearch };
}

export function useCustomerTimeline(
  customerId: string | null | undefined,
  companyId?: string | null,
) {
  const access = useTimelineAccess(companyId);

  return useQuery({
    queryKey: customerTimelineKey(customerId, companyId),
    enabled: Boolean(customerId && companyId && access),
    queryFn: () =>
      customerTimelineService.getTimeline({
        customerId: customerId!,
        companyId: companyId!,
        access: access!,
      }),
  });
}

export function useTimelineActivities(
  customerId: string | null | undefined,
  companyId: string | null | undefined,
  filter: TimelineFilter,
  search: string,
  groupMode: TimelineGroupMode = "day",
  renderContext?: { locale: string; translate: (key: string, options?: Record<string, unknown>) => string },
) {
  const access = useTimelineAccess(companyId);

  return useInfiniteQuery({
    queryKey: customerTimelinePageKey(customerId, companyId, filter, search, groupMode),
    enabled: Boolean(customerId && companyId && access),
    initialPageParam: null as { occurredAt: string; id: string; sourceModule?: string } | null,
    queryFn: ({ pageParam }) =>
      customerTimelineService.buildTimeline(
        {
          customerId: customerId!,
          companyId: companyId!,
          cursor: pageParam,
          limit: 30,
          filter,
          search,
          groupMode,
          access: access!,
        },
        renderContext ?? { locale: "en", translate: (key) => key },
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export function useCustomerProfileMetrics(
  customerId: string | null | undefined,
  companyId?: string | null,
) {
  const access = useTimelineAccess(companyId);

  return useQuery<CustomerProfileMetrics>({
    queryKey: customerProfileMetricsKey(customerId, companyId),
    enabled: Boolean(customerId && companyId && access),
    queryFn: () =>
      fetchCustomerProfileMetrics({
        customerId: customerId!,
        companyId: companyId!,
        access: access!,
      }),
  });
}

export { customerTimelineKey, customerProfileMetricsKey };
