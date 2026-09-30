import type { HandoffNotificationPort } from "@workspace/human-handoff-platform";
import { getNotificationServices } from "@/lib/notifications";
import { getTeamInboxDashboardHref } from "@/lib/customer-profile/services/inbox-navigation";
import { supabase } from "@/lib/supabase";

export function createHandoffNotificationBridge(): HandoffNotificationPort {
  return {
    async notify(input) {
      const notifications = getNotificationServices();
      const metaCustomer =
        typeof input.metadata?.customerName === "string"
          ? input.metadata.customerName.trim()
          : typeof input.metadata?.customer_name === "string"
            ? input.metadata.customer_name.trim()
            : "";
      const metaChannel =
        typeof input.metadata?.channel === "string"
          ? input.metadata.channel
          : typeof input.metadata?.channelType === "string"
            ? input.metadata.channelType
            : "";

      const resolved = await resolveHandoffContext(input.companyId, input.conversationId);
      const customerName = metaCustomer || resolved.customerName;
      const channel = (metaChannel || resolved.channel || "omnichannel").toLowerCase();

      await notifications.notifications.createNotification({
        companyId: input.companyId,
        event: "generic_system",
        userId: input.recipientUserId ?? null,
        recipients: input.recipientUserId
          ? [{ userId: input.recipientUserId, companyId: input.companyId }]
          : [],
        channels: ["in_app", "push"],
        params: {
          title: notificationTitle(input.kind),
          detail: customerName || "",
          customerName,
          conversationId: input.conversationId,
          channel,
          channelType: channel,
          queueId: input.queueId ?? "",
          actorUserId: input.actorUserId ?? "",
          kind: input.kind,
          navigationTarget: `${getTeamInboxDashboardHref().replace(/^~/, "")}?conversation=${encodeURIComponent(input.conversationId)}`,
          entityType: "conversation",
          entityId: input.conversationId,
        },
      });
    },
  };
}

async function resolveHandoffContext(
  companyId: string,
  conversationId: string,
): Promise<{ customerName: string; channel: string }> {
  try {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("customer_id, channel_type")
      .eq("company_id", companyId)
      .eq("id", conversationId)
      .maybeSingle();

    const channel = typeof conversation?.channel_type === "string" ? conversation.channel_type : "";
    const customerId =
      typeof conversation?.customer_id === "string" ? conversation.customer_id.trim() : "";
    if (!customerId) return { customerName: "", channel };

    const { data: customer } = await supabase
      .from("customers")
      .select("name")
      .eq("company_id", companyId)
      .eq("id", customerId)
      .maybeSingle();

    return {
      customerName: typeof customer?.name === "string" ? customer.name.trim() : "",
      channel,
    };
  } catch {
    return { customerName: "", channel: "" };
  }
}

function notificationTitle(kind: string): string {
  switch (kind) {
    case "transfer":
      return "Conversation transferred to you";
    case "assignment":
      return "Conversation assigned to you";
    case "escalation":
      return "Conversation escalated";
    case "queue_joined":
      return "Conversation entered queue";
    case "acceptance":
      return "Handoff accepted";
    case "rejection":
      return "Handoff rejected";
    case "return_to_ai":
      return "Conversation returned to AI";
    case "supervisor_alert":
      return "Supervisor alert";
    default:
      return "Handoff notification";
  }
}
