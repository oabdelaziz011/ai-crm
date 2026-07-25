import { supabase } from "@/lib/supabase";
import type { TimelineActivity, TimelineActivitySource, TimelineFetchInput } from "@/lib/customer-timeline/types";
import { truncateText } from "@/lib/customer-timeline/provider-utils";

export class NotificationsTimelineAggregator implements TimelineActivitySource {
  readonly sourceId = "notifications";

  async collect({ customerId, companyId }: TimelineFetchInput): Promise<TimelineActivity[]> {
    if (!companyId) return [];

    const { data: customer } = await supabase
      .from("customers")
      .select("user_id")
      .eq("id", customerId)
      .maybeSingle();

    if (!customer?.user_id) return [];

    const { data, error } = await supabase
      .from("notifications")
      .select("id, event_type, channel, priority, delivery_status, created_at, message_payload")
      .eq("company_id", companyId)
      .eq("user_id", customer.user_id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error || !data) return [];

    return data.map((row) => {
      const eventType = row.event_type ?? "generic_system";
      const detail = truncateText(String(row.message_payload ?? eventType));
      return {
        id: `${this.sourceId}:${row.id}`,
        type: "notification_delivered",
        occurredAt: row.created_at,
        source: this.sourceId,
        category: "notification",
        payload: {
          notificationId: row.id,
          eventType,
          channel: row.channel,
          priority: row.priority,
        },
        metadata: {
          detail,
          channel: row.channel,
          unread: row.delivery_status !== "read",
          searchText: [eventType, row.channel, detail, "notification"].join(" "),
          filterGroup: "notifications",
        },
        visibility: row.channel === "in_app" ? "internal" : "public",
      } satisfies TimelineActivity;
    });
  }
}
