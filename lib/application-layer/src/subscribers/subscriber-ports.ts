import type { PlatformEvent } from "@workspace/platform-events";

/** Emits reactive signals consumed by Supabase realtime → UI cache invalidation. */
export type ReactiveSignalPort = {
  emit(input: Readonly<{
    tenantId: string;
    signalType: string;
    entityType?: string;
    entityId?: string;
    correlationId: string;
    sourceSubscriber: string;
    metadata?: Readonly<Record<string, unknown>>;
  }>): Promise<void>;
};

/** Bridges platform events to automation platform — no direct module calls. */
export type AutomationDispatchPort = {
  dispatchFromPlatformEvent(envelope: PlatformEvent): Promise<void>;
};

/** Maps platform event types to automation workflow trigger names. */
export const PLATFORM_EVENT_AUTOMATION_MAP: Readonly<Partial<Record<string, string>>> = Object.freeze({
  LeadCreated: "lead_created",
  LeadConverted: "lead_converted",
  BookingCreated: "booking_created",
  BookingConfirmed: "booking_confirmed",
  BookingCancelled: "booking_cancelled",
  BookingCompleted: "booking_completed",
  BookingNoShow: "booking_no_show",
  BookingRescheduled: "booking_rescheduled",
  PaymentCollected: "payment_collected",
  InvoiceGenerated: "invoice_generated",
  InvoicePaid: "invoice_paid",
  TaskCreated: "task_created",
  TaskAssigned: "task_assigned",
  TaskCompleted: "task_completed",
  WorkflowExecuted: "workflow_executed",
  CustomerCreated: "customer_created",
  KnowledgeUpdated: "knowledge_updated",
});
