/**
 * Email delivery logs linked only by recipient email are UNSAFE for Activity.
 * This aggregator is intentionally a no-op (kept for import stability / audits).
 * Do not re-enable email matching as customer identity.
 */
import type { TimelineActivity, TimelineActivitySource, TimelineFetchInput } from "@/lib/customer-timeline/types";

export class EmailDeliveryTimelineAggregator implements TimelineActivitySource {
  readonly sourceId = "email";

  async collect(_input: TimelineFetchInput): Promise<TimelineActivity[]> {
    return [];
  }
}
