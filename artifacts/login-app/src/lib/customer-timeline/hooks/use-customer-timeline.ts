import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
  return useQuery({
    queryKey: customerTimelineKey(customerId, companyId),
    enabled: Boolean(customerId),
    queryFn: () =>
      customerTimelineService.getTimeline({
        customerId: customerId!,
        companyId,
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
  return useInfiniteQuery({
    queryKey: customerTimelinePageKey(customerId, companyId, filter, search, groupMode),
    enabled: Boolean(customerId),
    initialPageParam: null as { occurredAt: string; id: string } | null,
    queryFn: ({ pageParam }) =>
      customerTimelineService.buildTimeline(
        {
          customerId: customerId!,
          companyId,
          cursor: pageParam,
          limit: 30,
          filter,
          search,
          groupMode,
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
  return useQuery<CustomerProfileMetrics>({
    queryKey: customerProfileMetricsKey(customerId, companyId),
    enabled: Boolean(customerId),
    queryFn: () =>
      fetchCustomerProfileMetrics({
        customerId: customerId!,
        companyId,
      }),
  });
}

export { customerTimelineKey, customerProfileMetricsKey };
