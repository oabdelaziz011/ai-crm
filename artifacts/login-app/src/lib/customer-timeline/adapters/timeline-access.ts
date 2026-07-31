import {
  TimelineAccessRequiredError,
  TimelineTenantIsolationError,
  type TimelineAccessContext,
} from "@workspace/activity-timeline";
import type { TimelineFilter } from "@/lib/customer-timeline/types";
import {
  applyLegacyActivityFilters,
  mapTimelineEventToActivity,
} from "@/lib/customer-timeline/adapters/activity-timeline-bridge";
import type { TimelineEvent } from "@workspace/activity-timeline";

export type TimelineRequestAccess = {
  userId: string;
  companyId: string;
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
};

export function requireTimelineAccess(input: {
  access?: TimelineRequestAccess;
  companyId?: string | null;
}): TimelineRequestAccess {
  if (!input.access?.userId || !input.access.companyId) {
    throw new TimelineAccessRequiredError();
  }

  const requestCompanyId = input.companyId ?? input.access.companyId;
  if (requestCompanyId !== input.access.companyId) {
    throw new TimelineTenantIsolationError();
  }

  return input.access;
}

export function toTimelineAccessContext(access: TimelineRequestAccess): TimelineAccessContext {
  return {
    userId: access.userId,
    companyId: access.companyId,
    isSuperAdmin: access.isSuperAdmin,
    hasPermission: access.hasPermission,
  };
}

export function createPortalTimelineAccess(customerId: string, companyId: string): TimelineRequestAccess {
  return {
    userId: customerId,
    companyId,
    isSuperAdmin: false,
    hasPermission: () => true,
  };
}

export function createLegacyEventPredicate(
  filter?: TimelineFilter,
): ((event: TimelineEvent) => boolean) | undefined {
  if (!filter) return undefined;

  const hasLegacyConstraints =
    Boolean(filter.categories?.length) ||
    Boolean(filter.channels?.length) ||
    Boolean(filter.employeeId) ||
    filter.automationOnly ||
    filter.bookingOnly ||
    filter.invoiceOnly ||
    filter.unreadOnly ||
    Boolean(filter.legacyFilterId && filter.legacyFilterId !== "all");

  if (!hasLegacyConstraints) return undefined;

  return (event) => {
    const activity = mapTimelineEventToActivity(event);
    return applyLegacyActivityFilters([activity], filter).length > 0;
  };
}
