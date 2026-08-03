import type { PlatformEventSubscriber } from "./subscriber-types.js";
import type { PlatformEvent } from "../types/event-types.js";

import type { PlatformEventType } from "../types/event-types.js";

/** Isolated mock subscriber — simulates invoice module reacting to booking events. */
export class InvoiceSubscriber implements PlatformEventSubscriber {
  readonly subscriberId = "invoice";
  readonly subscribedEvents: PlatformEventType[] = ["BookingCompleted", "InvoiceGenerated", "InvoicePaid"];

  readonly handled: PlatformEvent[] = [];

  async handle(envelope: PlatformEvent): Promise<void> {
    this.handled.push(envelope);
  }
}

/** Isolated mock subscriber — simulates payment module. */
export class PaymentSubscriber implements PlatformEventSubscriber {
  readonly subscriberId = "payment";
  readonly subscribedEvents: PlatformEventType[] = ["BookingCompleted", "PaymentCollected", "InvoicePaid"];

  readonly handled: PlatformEvent[] = [];

  async handle(envelope: PlatformEvent): Promise<void> {
    this.handled.push(envelope);
  }
}

/** Isolated mock subscriber — simulates dashboard aggregation. */
export class DashboardSubscriber implements PlatformEventSubscriber {
  readonly subscriberId = "dashboard";
  readonly subscribedEvents: PlatformEventType[] = [
    "BookingCompleted",
    "PaymentCollected",
    "LeadConverted",
    "TaskCompleted",
  ];

  readonly handled: PlatformEvent[] = [];

  async handle(envelope: PlatformEvent): Promise<void> {
    this.handled.push(envelope);
  }
}

/** Isolated mock subscriber — simulates notification module. */
export class NotificationSubscriber implements PlatformEventSubscriber {
  readonly subscriberId = "notification";
  readonly subscribedEvents: PlatformEventType[] = [
    "BookingCompleted",
    "BookingConfirmed",
    "BookingCancelled",
    "PaymentCollected",
    "NotificationCreated",
    "LeadConverted",
  ];

  readonly handled: PlatformEvent[] = [];

  async handle(envelope: PlatformEvent): Promise<void> {
    this.handled.push(envelope);
  }
}

/** Isolated mock subscriber — simulates AI module. */
export class AISubscriber implements PlatformEventSubscriber {
  readonly subscriberId = "ai";
  readonly subscribedEvents: PlatformEventType[] = ["BookingCompleted", "AISummaryGenerated", "CustomerCreated"];

  readonly handled: PlatformEvent[] = [];

  async handle(envelope: PlatformEvent): Promise<void> {
    this.handled.push(envelope);
  }
}

/** Isolated mock subscriber — simulates workflow/automation module. */
export class WorkflowSubscriber implements PlatformEventSubscriber {
  readonly subscriberId = "workflow";
  readonly subscribedEvents: PlatformEventType[] = [
    "BookingCreated",
    "BookingCancelled",
    "LeadCreated",
    "WorkflowExecuted",
  ];

  readonly handled: PlatformEvent[] = [];

  async handle(envelope: PlatformEvent): Promise<void> {
    this.handled.push(envelope);
  }
}

/** Isolated mock subscriber — simulates reports module. */
export class ReportsSubscriber implements PlatformEventSubscriber {
  readonly subscriberId = "reports";
  readonly subscribedEvents: PlatformEventType[] = [
    "BookingCompleted",
    "PaymentCollected",
    "InvoicePaid",
    "WorkflowExecuted",
  ];

  readonly handled: PlatformEvent[] = [];

  async handle(envelope: PlatformEvent): Promise<void> {
    this.handled.push(envelope);
  }
}

export class WorkspaceSubscriber implements PlatformEventSubscriber {
  readonly subscriberId = "workspace";
  readonly subscribedEvents = "*" as const;

  readonly handled: PlatformEvent[] = [];

  async handle(envelope: PlatformEvent): Promise<void> {
    this.handled.push(envelope);
  }
}

export function createDefaultSubscribers(): PlatformEventSubscriber[] {
  return [
    new InvoiceSubscriber(),
    new PaymentSubscriber(),
    new DashboardSubscriber(),
    new NotificationSubscriber(),
    new AISubscriber(),
    new WorkflowSubscriber(),
    new ReportsSubscriber(),
    new WorkspaceSubscriber(),
  ];
}
