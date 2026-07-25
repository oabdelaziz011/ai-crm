import type { AutomationWorkflowInput } from "@/lib/automation/types";

export type WorkflowTemplateDefinition = AutomationWorkflowInput & {
  templateKey: string;
  category: string;
};

export const WORKFLOW_TEMPLATES: WorkflowTemplateDefinition[] = [
  {
    templateKey: "appointment_confirmation",
    name: "Appointment Confirmation",
    description: "Notify customer when an appointment is created.",
    category: "booking",
    trigger: { type: "appointment_created" },
    conditions: { operator: "and", conditions: [] },
    schedule: { type: "immediate" },
    actions: [
      { type: "send_whatsapp", enabled: true },
      { type: "send_email", enabled: true },
    ],
  },
  {
    templateKey: "appointment_reminder",
    name: "Appointment Reminder",
    description: "Remind customer before their appointment.",
    category: "booking",
    trigger: { type: "appointment_created" },
    conditions: { operator: "and", conditions: [] },
    schedule: { type: "before_appointment", beforeMinutes: 60 },
    actions: [{ type: "send_whatsapp", enabled: true }],
  },
  {
    templateKey: "appointment_cancellation",
    name: "Appointment Cancellation",
    description: "Notify customer when an appointment is cancelled.",
    category: "booking",
    trigger: { type: "appointment_cancelled" },
    conditions: { operator: "and", conditions: [] },
    schedule: { type: "immediate" },
    actions: [
      { type: "send_whatsapp", enabled: true },
      { type: "internal_notification", enabled: true },
    ],
  },
  {
    templateKey: "payment_receipt",
    name: "Payment Receipt",
    description: "Send receipt when payment is received.",
    category: "payment",
    trigger: { type: "invoice_paid" },
    conditions: { operator: "and", conditions: [] },
    schedule: { type: "immediate" },
    actions: [
      { type: "send_email", enabled: true },
      { type: "send_whatsapp", enabled: true },
    ],
  },
  {
    templateKey: "customer_welcome",
    name: "Customer Welcome",
    description: "Welcome new customers across channels.",
    category: "customer",
    trigger: { type: "customer_created" },
    conditions: { operator: "and", conditions: [] },
    schedule: { type: "immediate" },
    actions: [
      { type: "create_notification", enabled: true },
      { type: "send_email", enabled: true },
    ],
  },
  {
    templateKey: "internal_admin_alert",
    name: "Internal Admin Alert",
    description: "Alert admins on critical system events.",
    category: "system",
    trigger: { type: "system_event" },
    conditions: { operator: "and", conditions: [] },
    schedule: { type: "immediate" },
    actions: [{ type: "internal_notification", enabled: true, priority: "high" }],
  },
];

export function getWorkflowTemplate(templateKey: string): WorkflowTemplateDefinition | undefined {
  return WORKFLOW_TEMPLATES.find((template) => template.templateKey === templateKey);
}
