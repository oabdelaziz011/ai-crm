import type { PlatformEvent, PlatformEventType } from "@workspace/platform-events";
import type { ApplicationContext } from "../contracts/application-context.js";
import type { ApplicationPorts } from "../ports/repository-ports.js";
import type { ApplicationServices } from "../services/application-services.js";
import type { AutomationDispatchPort, ReactiveSignalPort } from "./subscriber-ports.js";
import {
  mapPlatformEventToNotificationInput,
  PLATFORM_NOTIFICATION_EVENT_TYPES,
} from "../notifications/platform-event-notification-mapper.js";

export type ProductionSubscriberDeps = Readonly<{
  getServices: () => ApplicationServices;
  ports: ApplicationPorts;
  reactive: ReactiveSignalPort;
  automation: AutomationDispatchPort;
  buildSystemContext: (envelope: PlatformEvent) => ApplicationContext;
}>;

async function withIdempotency(
  deps: ProductionSubscriberDeps,
  envelope: PlatformEvent,
  subscriberId: string,
  fn: () => Promise<void>,
): Promise<void> {
  const key = `${subscriberId}:${envelope.eventId}`;
  const store = deps.ports.configurationCache;
  void store;
  await fn();
}

export function createWorkspaceSubscriber(deps: ProductionSubscriberDeps) {
  return {
    subscriberId: "workspace",
    subscribedEvents: [
      "ConfigurationUpdated",
      "ConfigurationPublished",
      "FeatureFlagUpdated",
      "LicenseChanged",
    ] as PlatformEventType[],

    async handle(envelope: PlatformEvent) {
      await withIdempotency(deps, envelope, "workspace", async () => {
        const payload = envelope.payload as Record<string, unknown>;
        const domain = String(payload.domain ?? "workspace");
        const scopeKey = String(payload.scopeKey ?? "default");

        await deps.ports.configurationCache.invalidate(
          deps.ports.configurationCache.buildKey(envelope.tenantId, domain, scopeKey),
        );

        await deps.reactive.emit({
          tenantId: envelope.tenantId,
          signalType: "workspace.config",
          entityType: "configuration",
          entityId: String(payload.configurationId ?? domain),
          correlationId: envelope.correlationId,
          sourceSubscriber: "workspace",
          metadata: { domain, scopeKey, eventType: envelope.eventType },
        });
      });
    },
  };
}

export function createDashboardSubscriber(deps: ProductionSubscriberDeps) {
  return {
    subscriberId: "dashboard",
    subscribedEvents: [
      "PaymentCollected",
      "BookingCompleted",
      "LeadConverted",
      "TaskCompleted",
      "ConfigurationPublished",
      "InvoicePaid",
    ] as PlatformEventType[],

    async handle(envelope: PlatformEvent) {
      await withIdempotency(deps, envelope, "dashboard", async () => {
        const signalMap: Record<string, string> = {
          PaymentCollected: "dashboard.revenue",
          BookingCompleted: "dashboard.operations",
          LeadConverted: "dashboard.crm",
          TaskCompleted: "dashboard.operations",
          ConfigurationPublished: "dashboard.config",
          InvoicePaid: "dashboard.revenue",
        };

        await deps.reactive.emit({
          tenantId: envelope.tenantId,
          signalType: signalMap[envelope.eventType] ?? "dashboard.refresh",
          entityType: envelope.entityType,
          entityId: envelope.entityId,
          correlationId: envelope.correlationId,
          sourceSubscriber: "dashboard",
          metadata: { eventType: envelope.eventType },
        });
      });
    },
  };
}

export function createTimelineSubscriber(deps: ProductionSubscriberDeps) {
  return {
    subscriberId: "timeline",
    subscribedEvents: "*" as const,

    async handle(envelope: PlatformEvent) {
      await withIdempotency(deps, envelope, "timeline", async () => {
        if (!envelope.entityType || !envelope.entityId) return;
        await deps.reactive.emit({
          tenantId: envelope.tenantId,
          signalType: "timeline.refresh",
          entityType: envelope.entityType,
          entityId: envelope.entityId,
          correlationId: envelope.correlationId,
          sourceSubscriber: "timeline",
          metadata: { eventType: envelope.eventType },
        });
      });
    },
  };
}

export function createReportsSubscriber(deps: ProductionSubscriberDeps) {
  return {
    subscriberId: "reports",
    subscribedEvents: [
      "BookingCompleted",
      "PaymentCollected",
      "InvoicePaid",
      "WorkflowExecuted",
    ] as PlatformEventType[],

    async handle(envelope: PlatformEvent) {
      await withIdempotency(deps, envelope, "reports", async () => {
        await deps.reactive.emit({
          tenantId: envelope.tenantId,
          signalType: "reports.refresh",
          correlationId: envelope.correlationId,
          sourceSubscriber: "reports",
          metadata: { eventType: envelope.eventType },
        });
      });
    },
  };
}

export function createWorkflowSubscriber(deps: ProductionSubscriberDeps) {
  return {
    subscriberId: "workflow",
    subscribedEvents: [
      "BookingCreated",
      "BookingCancelled",
      "BookingCompleted",
      "BookingNoShow",
      "BookingRescheduled",
      "LeadCreated",
      "LeadConverted",
      "TaskCreated",
      "TaskAssigned",
      "TaskCompleted",
      "PaymentCollected",
      "InvoiceGenerated",
      "CustomerCreated",
      "WorkflowExecuted",
    ] as PlatformEventType[],

    async handle(envelope: PlatformEvent) {
      await withIdempotency(deps, envelope, "workflow", async () => {
        await deps.automation.dispatchFromPlatformEvent(envelope);
      });
    },
  };
}

export function createAISubscriber(deps: ProductionSubscriberDeps) {
  return {
    subscriberId: "ai",
    subscribedEvents: [
      "BookingCompleted",
      "PaymentCollected",
      "LeadConverted",
      "KnowledgeUpdated",
      "TaskCompleted",
      "WorkflowExecuted",
      "CustomerCreated",
      "CustomerUpdated",
    ] as PlatformEventType[],

    async handle(envelope: PlatformEvent) {
      await withIdempotency(deps, envelope, "ai", async () => {
        const services = deps.getServices();
        const ctx = deps.buildSystemContext(envelope);
        const payload = envelope.payload as Record<string, unknown>;

        if (envelope.eventType === "KnowledgeUpdated" && payload.documentId) {
          await services.knowledge.getDocument(String(payload.documentId), ctx);
        }

        await deps.reactive.emit({
          tenantId: envelope.tenantId,
          signalType: "ai.context_refresh",
          entityType: envelope.entityType,
          entityId: envelope.entityId,
          correlationId: envelope.correlationId,
          sourceSubscriber: "ai",
          metadata: { eventType: envelope.eventType },
        });
      });
    },
  };
}

export function createInvoiceSubscriber(deps: ProductionSubscriberDeps) {
  return {
    subscriberId: "invoice",
    subscribedEvents: ["BookingCompleted", "InvoiceGenerated", "InvoicePaid"] as PlatformEventType[],

    async handle(envelope: PlatformEvent) {
      await withIdempotency(deps, envelope, "invoice", async () => {
        await deps.reactive.emit({
          tenantId: envelope.tenantId,
          signalType: "billing.invoice",
          entityType: envelope.entityType ?? "invoice",
          entityId: envelope.entityId,
          correlationId: envelope.correlationId,
          sourceSubscriber: "invoice",
          metadata: { eventType: envelope.eventType },
        });
      });
    },
  };
}

export function createPaymentSubscriber(deps: ProductionSubscriberDeps) {
  return {
    subscriberId: "payment",
    subscribedEvents: ["BookingCompleted", "PaymentCollected", "InvoicePaid"] as PlatformEventType[],

    async handle(envelope: PlatformEvent) {
      await withIdempotency(deps, envelope, "payment", async () => {
        await deps.reactive.emit({
          tenantId: envelope.tenantId,
          signalType: "billing.payment",
          correlationId: envelope.correlationId,
          sourceSubscriber: "payment",
          metadata: { eventType: envelope.eventType },
        });
      });
    },
  };
}

export function createNotificationProductionSubscriber(deps: ProductionSubscriberDeps) {
  return {
    subscriberId: "notification",
    subscribedEvents: [...PLATFORM_NOTIFICATION_EVENT_TYPES] as PlatformEventType[],

    async handle(envelope: PlatformEvent) {
      await withIdempotency(deps, envelope, "notification", async () => {
        const input = mapPlatformEventToNotificationInput(envelope);
        if (!input) return;
        await deps.ports.notificationWrite.create(input);
      });
    },
  };
}

export function createProductionSubscribers(deps: ProductionSubscriberDeps) {
  return [
    createWorkspaceSubscriber(deps),
    createDashboardSubscriber(deps),
    createTimelineSubscriber(deps),
    createReportsSubscriber(deps),
    createWorkflowSubscriber(deps),
    createAISubscriber(deps),
    createInvoiceSubscriber(deps),
    createPaymentSubscriber(deps),
    createNotificationProductionSubscriber(deps),
  ];
}
