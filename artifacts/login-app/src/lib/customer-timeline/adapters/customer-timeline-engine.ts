import {
  InMemoryTimelineEventStore,
  TimelineEngine,
  TimelineEventRegistry,
  type TimelineEntityAccessPort,
} from "@workspace/activity-timeline";
import type { TimelineAggregator } from "@/lib/customer-timeline/aggregators/timeline-aggregator";
import { createLegacySourcePublisher } from "@/lib/customer-timeline/adapters/activity-timeline-bridge";

const SOURCE_MODULE_PERMISSIONS: Record<string, string[]> = {
  bookings: ["bookings.view"],
  calendar: ["bookings.view"],
  whatsapp: ["whatsapp.view", "channels.view"],
  automation: ["customers.view"],
  invoices: ["invoices.view"],
  payments: ["invoices.view"],
  tickets: ["tickets.view"],
  workflows: ["agents.view"],
  lifecycle: ["customers.view"],
  "customer-lifecycle": ["customers.view"],
  "agent-activity": ["whatsapp.view", "channels.view"],
  agent: ["whatsapp.view", "channels.view"],
  notes: ["customers.view"],
  notifications: ["customers.view"],
  email: ["channels.view"],
  ai: ["ai_assistant.view"],
  calls: ["customers.view"],
  documents: ["entity.files.read"],
};

function resolveRequiredPermissions(sourceId: string): string[] {
  return SOURCE_MODULE_PERMISSIONS[sourceId] ?? ["customers.view"];
}

export function createCustomerTimelineEngine(
  aggregator: TimelineAggregator,
  entityAccess: TimelineEntityAccessPort,
): TimelineEngine {
  const registry = new TimelineEventRegistry();

  for (const source of aggregator.listSources()) {
    const sourceId = String(source.sourceId);
    registry.registerPublisher(
      createLegacySourcePublisher(source, {
        sourceModule: sourceId,
        requiredPermissions: resolveRequiredPermissions(sourceId),
      }),
    );
  }

  return new TimelineEngine({
    registry,
    eventStore: new InMemoryTimelineEventStore(),
    entityAccess,
  });
}
