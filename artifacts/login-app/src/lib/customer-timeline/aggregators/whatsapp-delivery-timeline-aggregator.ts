import { supabase } from "@/lib/supabase";
import type { TimelineActivity, TimelineActivitySource, TimelineFetchInput } from "@/lib/customer-timeline/types";
import { truncateText } from "@/lib/customer-timeline/provider-utils";

export class WhatsAppDeliveryTimelineAggregator implements TimelineActivitySource {
  readonly sourceId = "whatsapp-delivery";

  async collect({ customerId, companyId }: TimelineFetchInput): Promise<TimelineActivity[]> {
    if (!companyId) return [];

    const { data: customer } = await supabase
      .from("customers")
      .select("phone")
      .eq("id", customerId)
      .maybeSingle();

    const phone = customer?.phone?.replace(/[^\d+]/g, "");
    if (!phone) return [];

    const { data, error } = await supabase
      .from("whatsapp_delivery_logs")
      .select("id, status, template_key, recipient_phone, message_id, created_at, last_error")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(150);

    if (error || !data) return [];

    const normalizedCustomerPhone = phone.replace(/^\+/, "");

    return data
      .filter((row) => {
        const recipient = String(row.recipient_phone ?? "").replace(/[^\d+]/g, "").replace(/^\+/, "");
        return recipient.endsWith(normalizedCustomerPhone) || normalizedCustomerPhone.endsWith(recipient);
      })
      .map((row) => {
        const template = truncateText(row.template_key ?? "WhatsApp message");
        return {
          id: `${this.sourceId}:delivery:${row.id}`,
          type: row.status === "completed" ? "whatsapp_message_sent" : "template_sent",
          occurredAt: row.created_at,
          source: this.sourceId,
          category: "communication",
          payload: {
            deliveryLogId: row.id,
            messageId: row.message_id,
            templateKey: row.template_key,
          },
          metadata: {
            detail: template,
            channel: "whatsapp",
            searchText: [template, row.recipient_phone, "whatsapp"].join(" "),
            filterGroup: "messages",
          },
        } satisfies TimelineActivity;
      });
  }
}
