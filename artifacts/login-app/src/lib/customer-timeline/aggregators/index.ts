import { timelineAggregator } from "./timeline-aggregator";
import { AgentActivityTimelineProvider } from "../providers/agent-activity-timeline-provider";
import { BookingsTimelineProvider } from "../providers/bookings-timeline-provider";
import { CustomerLifecycleTimelineProvider } from "../providers/customer-lifecycle-provider";
import { InvoicesTimelineProvider } from "../providers/invoices-timeline-provider";
import { WhatsappTimelineProvider } from "../providers/whatsapp-timeline-provider";
import { AutomationExecutionsTimelineAggregator } from "./automation-executions-timeline-aggregator";
import { TicketsTimelineAggregator } from "./tickets-timeline-aggregator";

let bootstrapped = false;

/**
 * Idempotent registration of Activity sources.
 *
 * Intentionally excluded (unsafe / non-deterministic customer linkage):
 * - WhatsAppDeliveryTimelineAggregator — phone / suffix matching
 * - EmailDeliveryTimelineAggregator — email matching
 * - NotificationsTimelineAggregator — customers.user_id is creator, not customer identity
 * - audit_logs (History tab owns audit trail)
 *
 * Campaign lifecycle remains on the Campaigns tab — not registered here.
 */
export function ensureTimelineAggregators(): void {
  if (bootstrapped) return;

  timelineAggregator.registerLegacyProvider(new CustomerLifecycleTimelineProvider());
  timelineAggregator.registerLegacyProvider(new WhatsappTimelineProvider());
  timelineAggregator.registerLegacyProvider(new BookingsTimelineProvider());
  timelineAggregator.registerLegacyProvider(new InvoicesTimelineProvider());
  timelineAggregator.registerLegacyProvider(new AgentActivityTimelineProvider());

  timelineAggregator.registerSource(new AutomationExecutionsTimelineAggregator());
  timelineAggregator.registerSource(new TicketsTimelineAggregator());

  bootstrapped = true;
}

export { timelineAggregator };

export { CustomerLifecycleTimelineProvider } from "../providers/customer-lifecycle-provider";
export { WhatsappTimelineProvider } from "../providers/whatsapp-timeline-provider";
export { BookingsTimelineProvider } from "../providers/bookings-timeline-provider";
export { InvoicesTimelineProvider } from "../providers/invoices-timeline-provider";
export { AgentActivityTimelineProvider } from "../providers/agent-activity-timeline-provider";
