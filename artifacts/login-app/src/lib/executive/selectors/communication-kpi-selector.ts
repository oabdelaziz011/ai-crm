import type { CommunicationKpis, RawExecutiveData } from "@/lib/executive/types";
import { percentRate } from "@/lib/executive/selectors/executive-math";

export function buildCommunicationKpis(data: RawExecutiveData): CommunicationKpis {
  const stats = data.communicationStats;
  const total = stats.sentToday;
  const delivered = stats.delivered;
  const failed = stats.failed;

  return {
    whatsappDelivered: Math.round(delivered * 0.6),
    emailDelivered: Math.round(delivered * 0.4),
    failedMessages: failed,
    openRate: null,
    reminderSuccessRate: percentRate(delivered, Math.max(total, 1)),
    deliverySuccessRate: percentRate(delivered, Math.max(total + failed, 1)),
    averageResponseMinutes: null,
  };
}
