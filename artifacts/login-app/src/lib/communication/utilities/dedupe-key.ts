import type { CommunicationSendRequest } from "@/lib/communication/types";

export function buildCommunicationDedupeKey(request: CommunicationSendRequest): string {
  const parts = [
    request.companyId,
    request.templateKey,
    request.channels.slice().sort().join(","),
    request.recipient.customerId ?? request.recipient.email ?? request.recipient.phone ?? "",
    request.scheduledAt ?? "now",
    request.idempotencyKey ?? "",
  ];
  return parts.join("|");
}
