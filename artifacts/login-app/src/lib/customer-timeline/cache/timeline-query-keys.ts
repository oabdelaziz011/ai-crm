import type { TimelineFilter, TimelineGroupMode } from "@/lib/customer-timeline/types";

export const customerTimelineKey = (
  customerId: string | null | undefined,
  companyId?: string | null,
) => ["customer-timeline", customerId, companyId ?? null] as const;

export const customerTimelinePageKey = (
  customerId: string | null | undefined,
  companyId: string | null | undefined,
  filter: TimelineFilter | undefined,
  search: string,
  groupMode: TimelineGroupMode,
) =>
  [
    "customer-timeline-page",
    customerId,
    companyId ?? null,
    filter ?? {},
    search,
    groupMode,
  ] as const;

export const customerProfileMetricsKey = (
  customerId: string | null | undefined,
  companyId?: string | null,
) => ["customer-profile-metrics", customerId, companyId ?? null] as const;
