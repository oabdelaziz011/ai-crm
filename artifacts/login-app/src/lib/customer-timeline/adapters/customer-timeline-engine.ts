import {
  InMemoryTimelineEventStore,
  TimelineEngine,
  TimelineEventRegistry,
  type TimelineEntityAccessPort,
} from "@workspace/activity-timeline";
import type { TimelineAggregator } from "@/lib/customer-timeline/aggregators/timeline-aggregator";
import { createLegacySourcePublisher } from "@/lib/customer-timeline/adapters/activity-timeline-bridge";

const SOURCE_MODULE_PERMISSIONS: Record<string, string[]> = {
  bookings: ["customers.view"],
  calendar: ["customers.view"],
  notifications: ["customers.view"],
  email: ["customers.view"],
  whatsapp: ["customers.view"],
  automation: ["customers.view"],
  invoices: ["customers.view"],
  payments: ["customers.view"],
  notes: ["customers.view"],
  lifecycle: ["customers.view"],
  agent: ["customers.view"],
  ai: ["customers.view"],
  calls: ["customers.view"],
  documents: ["customers.view"],
  tickets: ["tickets.view"],
  workflows: ["agents.view"],
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
