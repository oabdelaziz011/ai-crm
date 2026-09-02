/**
 * Notifications keyed by customers.user_id are UNSAFE — that column is typically
 * the CRM creator, not a customer portal identity.
 * Intentionally a no-op until a deterministic customer_id linkage exists.
 */
import type { TimelineActivity, TimelineActivitySource, TimelineFetchInput } from "@/lib/customer-timeline/types";

export class NotificationsTimelineAggregator implements TimelineActivitySource {
  readonly sourceId = "notifications";

  async collect(_input: TimelineFetchInput): Promise<TimelineActivity[]> {
    return [];
  }
}
