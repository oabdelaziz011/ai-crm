import type { AutomationTrigger, AutomationTriggerType } from "@/lib/automation/types";
import { BUSINESS_EVENT_TO_TRIGGER } from "@/lib/automation/types/automation-enums";

export const TRIGGER_DEFINITIONS: Record<
  AutomationTriggerType,
  { labelKey: string; businessEvent: string | null }
> = {
  appointment_created: { labelKey: "automation.triggers.appointmentCreated", businessEvent: "booking.created" },
  appointment_updated: { labelKey: "automation.triggers.appointmentUpdated", businessEvent: "booking.updated" },
  appointment_cancelled: { labelKey: "automation.triggers.appointmentCancelled", businessEvent: "booking.cancelled" },
  appointment_completed: { labelKey: "automation.triggers.appointmentCompleted", businessEvent: "booking.completed" },
  customer_created: { labelKey: "automation.triggers.customerCreated", businessEvent: "customer.created" },
  invoice_created: { labelKey: "automation.triggers.invoiceCreated", businessEvent: "invoice.created" },
  invoice_paid: { labelKey: "automation.triggers.invoicePaid", businessEvent: "payment.received" },
  ticket_created: { labelKey: "automation.triggers.ticketCreated", businessEvent: "ticket.created" },
  ticket_updated: { labelKey: "automation.triggers.ticketUpdated", businessEvent: "ticket.updated" },
  ticket_closed: { labelKey: "automation.triggers.ticketClosed", businessEvent: "ticket.closed" },
  lead_created: { labelKey: "automation.triggers.leadCreated", businessEvent: "lead.created" },
  lead_updated: { labelKey: "automation.triggers.leadUpdated", businessEvent: "lead.updated" },
  lead_converted: { labelKey: "automation.triggers.leadConverted", businessEvent: "lead.converted" },
  lead_stage_changed: { labelKey: "automation.triggers.leadStageChanged", businessEvent: "lead.stage_changed" },
  handoff_escalated: { labelKey: "automation.triggers.handoffEscalated", businessEvent: "conversation.escalated" },
  handoff_transferred: { labelKey: "automation.triggers.handoffTransferred", businessEvent: "conversation.transferred" },
  handoff_returned_to_ai: { labelKey: "automation.triggers.handoffReturnedToAi", businessEvent: "conversation.returned_to_ai" },
  conversation_created: { labelKey: "automation.triggers.conversationCreated", businessEvent: "conversation.created" },
  conversation_closed: { labelKey: "automation.triggers.conversationClosed", businessEvent: "conversation.closed" },
  system_event: { labelKey: "automation.triggers.systemEvent", businessEvent: "system.generic" },
  custom_event: { labelKey: "automation.triggers.customEvent", businessEvent: null },
};

export function triggerMatchesEvent(trigger: AutomationTrigger, businessEventName: string): boolean {
  if (trigger.type === "custom_event") {
    return Boolean(trigger.customEventName && trigger.customEventName === businessEventName);
  }
  const mapped = TRIGGER_DEFINITIONS[trigger.type]?.businessEvent;
  return mapped === businessEventName;
}

export function businessEventToTriggerType(businessEventName: string): AutomationTriggerType | null {
  return BUSINESS_EVENT_TO_TRIGGER[businessEventName] ?? null;
}

export function listSupportedTriggerTypes(): AutomationTriggerType[] {
  return Object.keys(TRIGGER_DEFINITIONS) as AutomationTriggerType[];
}
