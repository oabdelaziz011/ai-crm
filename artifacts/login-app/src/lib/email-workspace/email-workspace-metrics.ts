/**
 * Email Control Center outbound metrics.
 * Counts omnichannel Email conversation messages — not Communication Center queue rows.
 */
import type { ConversationMessageRecord } from "@workspace/ai-conversation";
import { resolveOutboundDeliveryPhase } from "@/lib/omnichannel/services/outbound-delivery";

export type EmailOutboundMetricRow = {
  message_type: string;
  status: string;
  metadata?: Record<string, unknown> | null;
  external_message_id?: string | null;
};

export type EmailOutboundMetricCounts = {
  sent: number;
  pending: number;
  failed: number;
};

/**
 * Scope: company-scoped Email conversation outgoing messages (all-time).
 * sent = confirmed sent/delivered/read
 * pending = preparing / dispatching / pending_retry
 * failed = failed
 */
export function countEmailWorkspaceOutboundMetrics(
  rows: EmailOutboundMetricRow[],
): EmailOutboundMetricCounts {
  let sent = 0;
  let pending = 0;
  let failed = 0;

  for (const row of rows) {
    if (row.message_type !== "outgoing") continue;
    const phase = resolveOutboundDeliveryPhase({
      message_type: "outgoing",
      status: row.status,
      metadata: row.metadata ?? {},
      external_message_id: row.external_message_id ?? null,
    } as ConversationMessageRecord);

    if (phase === "sent" || phase === "delivered" || phase === "read") {
      sent += 1;
      continue;
    }
    if (phase === "failed") {
      failed += 1;
      continue;
    }
    if (phase === "draft") continue;
    pending += 1;
  }

  return { sent, pending, failed };
}
