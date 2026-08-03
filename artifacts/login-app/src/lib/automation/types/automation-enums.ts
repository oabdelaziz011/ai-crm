export const AUTOMATION_STATUSES = [
  "pending",
  "scheduled",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number];

export const AUTOMATION_TRIGGER_TYPES = [
  "appointment_created",
  "appointment_updated",
  "appointment_cancelled",
  "appointment_completed",
  "customer_created",
  "invoice_created",
  "invoice_paid",
  "ticket_created",
  "ticket_updated",
  "ticket_closed",
  "lead_created",
  "lead_updated",
  "lead_converted",
  "lead_stage_changed",
  "handoff_escalated",
  "handoff_transferred",
  "handoff_returned_to_ai",
  "conversation_created",
  "conversation_closed",
  "system_event",
  "custom_event",
] as const;
export type AutomationTriggerType = (typeof AUTOMATION_TRIGGER_TYPES)[number];

export const AUTOMATION_CONDITION_FIELDS = [
  "branch",
  "company",
  "customer_tag",
  "booking_status",
  "resource",
  "priority",
  "tenant",
  "date",
  "time_window",
] as const;
export type AutomationConditionField = (typeof AUTOMATION_CONDITION_FIELDS)[number];

export const AUTOMATION_CONDITION_OPERATORS = [
  "eq",
  "neq",
  "in",
  "contains",
  "between",
  "before",
  "after",
] as const;
export type AutomationConditionOperator = (typeof AUTOMATION_CONDITION_OPERATORS)[number];

export const AUTOMATION_DELAY_TYPES = [
  "immediate",
  "after_minutes",
  "after_hours",
  "after_days",
  "before_appointment",
  "at_specific_time",
] as const;
export type AutomationDelayType = (typeof AUTOMATION_DELAY_TYPES)[number];

export const AUTOMATION_ACTION_TYPES = [
  "create_notification",
  "send_email",
  "send_whatsapp",
  "internal_notification",
  "sms",
  "push",
  "webhook",
  "ai_action",
] as const;
export type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[number];

export const AUTOMATION_HISTORY_STEP_TYPES = ["trigger", "condition", "delay", "action"] as const;
export type AutomationHistoryStepType = (typeof AUTOMATION_HISTORY_STEP_TYPES)[number];

export const AUTOMATION_SCHEDULE_STATUSES = ["pending", "consumed", "cancelled"] as const;
export type AutomationScheduleStatus = (typeof AUTOMATION_SCHEDULE_STATUSES)[number];

/** Maps automation triggers to business event names consumed by the engine. */
export const TRIGGER_TO_BUSINESS_EVENT: Record<AutomationTriggerType, string | null> = {
  appointment_created: "booking.created",
  appointment_updated: "booking.updated",
  appointment_cancelled: "booking.cancelled",
  appointment_completed: "booking.completed",
  customer_created: "customer.created",
  invoice_created: "invoice.created",
  invoice_paid: "payment.received",
  ticket_created: "ticket.created",
  ticket_updated: "ticket.updated",
  ticket_closed: "ticket.closed",
  lead_created: "lead.created",
  lead_updated: "lead.updated",
  lead_converted: "lead.converted",
  lead_stage_changed: "lead.stage_changed",
  handoff_escalated: "conversation.escalated",
  handoff_transferred: "conversation.transferred",
  handoff_returned_to_ai: "conversation.returned_to_ai",
  conversation_created: "conversation.created",
  conversation_closed: "conversation.closed",
  system_event: "system.generic",
  custom_event: null,
};

export const BUSINESS_EVENT_TO_TRIGGER: Record<string, AutomationTriggerType> = {
  "booking.created": "appointment_created",
  "booking.updated": "appointment_updated",
  "booking.cancelled": "appointment_cancelled",
  "booking.completed": "appointment_completed",
  "customer.created": "customer_created",
  "invoice.created": "invoice_created",
  "payment.received": "invoice_paid",
  "ticket.created": "ticket_created",
  "ticket.updated": "ticket_updated",
  "ticket.closed": "ticket_closed",
  "ticket.reopened": "ticket_updated",
  "ticket.assigned": "ticket_updated",
  "ticket.comment_added": "ticket_updated",
  "ticket.priority_changed": "ticket_updated",
  "ticket.deleted": "ticket_updated",
  "ticket.status_changed": "ticket_updated",
  "lead.created": "lead_created",
  "lead.updated": "lead_updated",
  "lead.deleted": "lead_updated",
  "lead.assigned": "lead_updated",
  "lead.reassigned": "lead_updated",
  "lead.qualified": "lead_updated",
  "lead.disqualified": "lead_updated",
  "lead.converted": "lead_converted",
  "lead.archived": "lead_updated",
  "lead.restored": "lead_updated",
  "lead.stage_changed": "lead_stage_changed",
  "lead.pipeline_changed": "lead_updated",
  "conversation.transferred": "handoff_transferred",
  "conversation.accepted": "handoff_transferred",
  "conversation.rejected": "handoff_transferred",
  "conversation.escalated": "handoff_escalated",
  "conversation.returned_to_ai": "handoff_returned_to_ai",
  "conversation.queue_joined": "handoff_transferred",
  "conversation.queue_left": "handoff_transferred",
  "conversation.owner_changed": "handoff_transferred",
  "conversation.paused": "conversation_closed",
  "conversation.resumed": "conversation_created",
  "conversation.closed": "conversation_closed",
  "system.generic": "system_event",
};
