import type { RenderedEmail } from "@/lib/notifications/providers/email/types/email-types";

export type EmailTemplateDefinition = {
  key: string;
  notificationEvent: string;
  subjectKey: string;
  htmlKey: string;
  textKey: string;
};

export const EMAIL_TEMPLATE_REGISTRY: Record<string, EmailTemplateDefinition> = {
  appointment_created: {
    key: "appointment_confirmation",
    notificationEvent: "appointment_created",
    subjectKey: "notifications.email.templates.appointmentConfirmation.subject",
    htmlKey: "notifications.email.templates.appointmentConfirmation.html",
    textKey: "notifications.email.templates.appointmentConfirmation.text",
  },
  appointment_updated: {
    key: "appointment_updated",
    notificationEvent: "appointment_updated",
    subjectKey: "notifications.email.templates.appointmentUpdated.subject",
    htmlKey: "notifications.email.templates.appointmentUpdated.html",
    textKey: "notifications.email.templates.appointmentUpdated.text",
  },
  appointment_cancelled: {
    key: "appointment_cancelled",
    notificationEvent: "appointment_cancelled",
    subjectKey: "notifications.email.templates.appointmentCancelled.subject",
    htmlKey: "notifications.email.templates.appointmentCancelled.html",
    textKey: "notifications.email.templates.appointmentCancelled.text",
  },
  customer_created: {
    key: "customer_welcome",
    notificationEvent: "customer_created",
    subjectKey: "notifications.email.templates.customerWelcome.subject",
    htmlKey: "notifications.email.templates.customerWelcome.html",
    textKey: "notifications.email.templates.customerWelcome.text",
  },
  invoice_created: {
    key: "invoice_created",
    notificationEvent: "invoice_created",
    subjectKey: "notifications.email.templates.invoiceCreated.subject",
    htmlKey: "notifications.email.templates.invoiceCreated.html",
    textKey: "notifications.email.templates.invoiceCreated.text",
  },
  payment_received: {
    key: "payment_received",
    notificationEvent: "payment_received",
    subjectKey: "notifications.email.templates.paymentReceived.subject",
    htmlKey: "notifications.email.templates.paymentReceived.html",
    textKey: "notifications.email.templates.paymentReceived.text",
  },
  generic_system: {
    key: "generic_system",
    notificationEvent: "generic_system",
    subjectKey: "notifications.email.templates.genericSystem.subject",
    htmlKey: "notifications.email.templates.genericSystem.html",
    textKey: "notifications.email.templates.genericSystem.text",
  },
};

export function resolveEmailTemplate(event: string): EmailTemplateDefinition | null {
  return EMAIL_TEMPLATE_REGISTRY[event] ?? EMAIL_TEMPLATE_REGISTRY.generic_system;
}

export type EmailRenderFn = (
  key: string,
  params: Record<string, string>,
) => string;

export function renderEmailFromRegistry(
  event: string,
  params: Record<string, string>,
  render: EmailRenderFn,
): RenderedEmail {
  const template = resolveEmailTemplate(event) ?? EMAIL_TEMPLATE_REGISTRY.generic_system;
  return {
    templateKey: template.key,
    subject: render(template.subjectKey, params),
    html: render(template.htmlKey, params),
    text: render(template.textKey, params),
  };
}
