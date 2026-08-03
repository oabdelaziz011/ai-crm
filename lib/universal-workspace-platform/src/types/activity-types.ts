export type ActivityEventType =
  | "customer_created"
  | "lead_converted"
  | "invoice_generated"
  | "payment_collected"
  | "whatsapp_sent"
  | "employee_assigned"
  | "task_completed"
  | "ai_summary"
  | "workflow_triggered";

export type ActivityPeriod = "today" | "yesterday" | "this_week" | "older";

export type ActivityEvent = {
  id: string;
  type: ActivityEventType;
  title: string;
  description: string;
  actor: string;
  occurredAt: string;
  period: ActivityPeriod;
  entityType?: string;
  entityId?: string;
  icon: string;
};

export type ActivityGroup = {
  period: ActivityPeriod;
  labelKey: string;
  events: ActivityEvent[];
};
