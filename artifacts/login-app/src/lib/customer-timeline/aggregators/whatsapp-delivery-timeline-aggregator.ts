/**
 * WhatsApp delivery logs linked only by recipient phone are UNSAFE for Activity.
 * This aggregator is intentionally a no-op (kept for import stability / audits).
 * Do not re-enable phone / last-9 / suffix matching.
 */
import type { TimelineActivity, TimelineActivitySource, TimelineFetchInput } from "@/lib/customer-timeline/types";

export class WhatsAppDeliveryTimelineAggregator implements TimelineActivitySource {
  readonly sourceId = "whatsapp-delivery";

  async collect(_input: TimelineFetchInput): Promise<TimelineActivity[]> {
    return [];
  }
}
