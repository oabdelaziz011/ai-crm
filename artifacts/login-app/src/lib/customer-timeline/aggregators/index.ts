import { timelineAggregator } from "./timeline-aggregator";
import { AgentActivityTimelineProvider } from "../providers/agent-activity-timeline-provider";
import { BookingsTimelineProvider } from "../providers/bookings-timeline-provider";
import { CustomerLifecycleTimelineProvider } from "../providers/customer-lifecycle-provider";
import { InvoicesTimelineProvider } from "../providers/invoices-timeline-provider";
import { WhatsappTimelineProvider } from "../providers/whatsapp-timeline-provider";
import { NotificationsTimelineAggregator } from "./notifications-timeline-aggregator";
import { EmailDeliveryTimelineAggregator } from "./email-delivery-timeline-aggregator";
import { WhatsAppDeliveryTimelineAggregator } from "./whatsapp-delivery-timeline-aggregator";
import { AutomationExecutionsTimelineAggregator } from "./automation-executions-timeline-aggregator";
import { TicketsTimelineAggregator } from "./tickets-timeline-aggregator";

let bootstrapped = false;

/** Idempotent registration of all timeline activity sources. */
export function ensureTimelineAggregators(): void {
  if (bootstrapped) return;

  timelineAggregator.registerLegacyProvider(new CustomerLifecycleTimelineProvider());
  timelineAggregator.registerLegacyProvider(new WhatsappTimelineProvider());
  timelineAggregator.registerLegacyProvider(new BookingsTimelineProvider());
  timelineAggregator.registerLegacyProvider(new InvoicesTimelineProvider());
  timelineAggregator.registerLegacyProvider(new AgentActivityTimelineProvider());

  timelineAggregator.registerSource(new NotificationsTimelineAggregator());
  timelineAggregator.registerSource(new EmailDeliveryTimelineAggregator());
  timelineAggregator.registerSource(new WhatsAppDeliveryTimelineAggregator());
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
