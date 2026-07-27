import type { CommunicationQueueStatus } from "@/lib/communication/types";
import type { NotificationQueueStatus } from "@/lib/notifications/types";

/** Maps notification_queue DB statuses to communication platform statuses. */
export function mapDbStatusToCommunication(
  status: NotificationQueueStatus,
  retryCount: number,
  delivered?: boolean,
): CommunicationQueueStatus {
  if (status === "pending") return "queued";
  if (status === "processing") return "processing";
  if (status === "completed") return delivered ? "delivered" : "sent";
  if (status === "failed") return retryCount > 0 ? "retrying" : "failed";
  return "queued";
}

export function mapCommunicationToDbStatus(
  status: CommunicationQueueStatus,
): NotificationQueueStatus {
  switch (status) {
    case "queued":
      return "pending";
    case "processing":
      return "processing";
    case "sent":
    case "delivered":
      return "completed";
    case "failed":
    case "retrying":
      return "failed";
    case "cancelled":
      return "failed";
    default:
      return "pending";
  }
}
