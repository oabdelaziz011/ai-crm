import { supabase } from "@/lib/supabase";
import type { TimelineActivity, TimelineActivitySource, TimelineFetchInput } from "@/lib/customer-timeline/types";
import { truncateText } from "@/lib/customer-timeline/provider-utils";

export class EmailDeliveryTimelineAggregator implements TimelineActivitySource {
  readonly sourceId = "email";

  async collect({ customerId, companyId }: TimelineFetchInput): Promise<TimelineActivity[]> {
    if (!companyId) return [];

    const { data: customer } = await supabase
      .from("customers")
      .select("email")
      .eq("id", customerId)
      .maybeSingle();

    const email = customer?.email?.trim();
    if (!email) return [];

    const { data, error } = await supabase
      .from("email_delivery_logs")
      .select("id, status, subject, recipient_email, created_at, last_error")
      .eq("company_id", companyId)
      .eq("recipient_email", email)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error || !data) return [];

    return data.map((row) => {
      const subject = truncateText(row.subject ?? "Email");
      return {
        id: `${this.sourceId}:${row.id}`,
        type: row.status === "completed" ? "email_sent" : "email_received",
        occurredAt: row.created_at,
        source: this.sourceId,
        category: "email",
        payload: { deliveryLogId: row.id, status: row.status },
        metadata: {
          detail: subject,
          channel: "email",
          searchText: [subject, row.recipient_email, "email"].join(" "),
          filterGroup: "messages",
        },
      } satisfies TimelineActivity;
    });
  }
}
