import type { HandoffNotificationPort } from "@workspace/human-handoff-platform";
import { getNotificationServices } from "@/lib/notifications";

export function createHandoffNotificationBridge(): HandoffNotificationPort {
  return {
    async notify(input) {
      const notifications = getNotificationServices();
      const recipients = input.recipientUserId ? [input.recipientUserId] : [];

      await notifications.createNotification({
        companyId: input.companyId,
        event: `handoff.${input.kind}`,
        title: notificationTitle(input.kind),
        body: `Conversation ${input.conversationId}`,
        recipients,
        channels: ["in_app", "push"],
        metadata: {
          conversationId: input.conversationId,
          queueId: input.queueId,
          actorUserId: input.actorUserId,
          ...input.metadata,
        },
      });
    },
  };
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
