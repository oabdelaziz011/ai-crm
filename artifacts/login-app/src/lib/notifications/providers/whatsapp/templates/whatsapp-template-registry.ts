import type { RenderedWhatsAppMessage } from "@/lib/notifications/providers/whatsapp/types/whatsapp-types";

export type WhatsAppTemplateDefinition = {
  key: string;
  notificationEvent: string;
  /** Meta-approved template names per locale (e.g. en, ar). */
  templateIds: Record<string, string>;
  bodyKey: string;
  parameterKeys: string[];
};

export const WHATSAPP_TEMPLATE_REGISTRY: Record<string, WhatsAppTemplateDefinition> = {
  appointment_created: {
    key: "appointment_confirmation",
    notificationEvent: "appointment_created",
    templateIds: { en: "appointment_confirmation", ar: "appointment_confirmation_ar" },
    bodyKey: "notifications.whatsapp.templates.appointmentConfirmation.body",
    parameterKeys: ["customerName", "service", "date", "time"],
  },
  appointment_reminder: {
    key: "appointment_reminder",
    notificationEvent: "appointment_reminder",
    templateIds: { en: "appointment_reminder", ar: "appointment_reminder_ar" },
    bodyKey: "notifications.whatsapp.templates.appointmentReminder.body",
    parameterKeys: ["customerName", "service", "date", "time"],
  },
  appointment_updated: {
    key: "appointment_updated",
    notificationEvent: "appointment_updated",
    templateIds: { en: "appointment_updated", ar: "appointment_updated_ar" },
    bodyKey: "notifications.whatsapp.templates.appointmentUpdated.body",
    parameterKeys: ["customerName", "service", "date", "time"],
  },
  appointment_cancelled: {
    key: "appointment_cancelled",
    notificationEvent: "appointment_cancelled",
    templateIds: { en: "appointment_cancelled", ar: "appointment_cancelled_ar" },
    bodyKey: "notifications.whatsapp.templates.appointmentCancelled.body",
    parameterKeys: ["customerName", "service", "date"],
  },
  invoice_created: {
    key: "invoice_created",
    notificationEvent: "invoice_created",
    templateIds: { en: "invoice_created", ar: "invoice_created_ar" },
    bodyKey: "notifications.whatsapp.templates.invoiceCreated.body",
    parameterKeys: ["customerName", "invoiceId", "amount"],
  },
  payment_received: {
    key: "payment_received",
    notificationEvent: "payment_received",
    templateIds: { en: "payment_received", ar: "payment_received_ar" },
    bodyKey: "notifications.whatsapp.templates.paymentReceived.body",
    parameterKeys: ["customerName", "amount"],
  },
  generic_system: {
    key: "generic_system",
    notificationEvent: "generic_system",
    templateIds: { en: "generic_system", ar: "generic_system_ar" },
    bodyKey: "notifications.whatsapp.templates.genericSystem.body",
    parameterKeys: ["detail"],
  },
};

export function resolveWhatsAppTemplate(event: string): WhatsAppTemplateDefinition {
  return WHATSAPP_TEMPLATE_REGISTRY[event] ?? WHATSAPP_TEMPLATE_REGISTRY.generic_system;
}

export type WhatsAppRenderFn = (key: string, params: Record<string, string>) => string;

export function resolveTemplateId(
  template: WhatsAppTemplateDefinition,
  languageCode: string,
): string {
  const normalized = languageCode.split("-")[0]?.toLowerCase() ?? "en";
  return template.templateIds[normalized] ?? template.templateIds.en ?? template.key;
}

export function renderWhatsAppFromRegistry(
  event: string,
  params: Record<string, string>,
  languageCode: string,
  render: WhatsAppRenderFn,
): RenderedWhatsAppMessage {
  const template = resolveWhatsAppTemplate(event);
  const bodyParameters = template.parameterKeys.map((key) => params[key] ?? "");
  return {
    templateKey: template.key,
    templateId: resolveTemplateId(template, languageCode),
    languageCode: languageCode.split("-")[0]?.toLowerCase() ?? "en",
    bodyParameters,
    fallbackText: render(template.bodyKey, params),
  };
}
