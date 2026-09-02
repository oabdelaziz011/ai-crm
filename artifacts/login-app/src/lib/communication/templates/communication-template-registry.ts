import type { CommunicationTemplateDefinition } from "@/lib/communication/types";

export const COMMUNICATION_TEMPLATE_REGISTRY: Record<string, CommunicationTemplateDefinition> = {
  booking_created: {
    key: "booking_created",
    notificationEvent: "appointment_created",
    category: "booking",
    version: 1,
    supportedChannels: ["whatsapp", "email", "sms", "push"],
    variableKeys: ["customerName", "service", "date", "time", "resource"],
    titleKey: "communication.templates.bookingCreated.title",
    bodyKey: "communication.templates.bookingCreated.body",
  },
  booking_reminder: {
    key: "booking_reminder",
    notificationEvent: "appointment_reminder",
    category: "booking",
    version: 1,
    supportedChannels: ["whatsapp", "email", "sms"],
    variableKeys: ["customerName", "service", "date", "time"],
    titleKey: "communication.templates.bookingReminder.title",
    bodyKey: "communication.templates.bookingReminder.body",
  },
  booking_cancelled: {
    key: "booking_cancelled",
    notificationEvent: "appointment_cancelled",
    category: "booking",
    version: 1,
    supportedChannels: ["whatsapp", "email", "sms"],
    variableKeys: ["customerName", "service", "date", "time", "reason"],
    titleKey: "communication.templates.bookingCancelled.title",
    bodyKey: "communication.templates.bookingCancelled.body",
  },
  booking_rescheduled: {
    key: "booking_rescheduled",
    notificationEvent: "appointment_updated",
    category: "booking",
    version: 1,
    supportedChannels: ["whatsapp", "email", "sms"],
    variableKeys: ["customerName", "service", "date", "time"],
    titleKey: "communication.templates.bookingRescheduled.title",
    bodyKey: "communication.templates.bookingRescheduled.body",
  },
  booking_checked_in: {
    key: "booking_checked_in",
    notificationEvent: "generic_system",
    category: "booking",
    version: 1,
    supportedChannels: ["email", "push"],
    variableKeys: ["customerName", "service"],
    titleKey: "communication.templates.bookingCheckedIn.title",
    bodyKey: "communication.templates.bookingCheckedIn.body",
  },
  booking_completed: {
    key: "booking_completed",
    notificationEvent: "generic_system",
    category: "booking",
    version: 1,
    supportedChannels: ["email", "push"],
    variableKeys: ["customerName", "service"],
    titleKey: "communication.templates.bookingCompleted.title",
    bodyKey: "communication.templates.bookingCompleted.body",
  },
  invoice_created: {
    key: "invoice_created",
    notificationEvent: "invoice_created",
    category: "invoice",
    version: 1,
    supportedChannels: ["whatsapp", "email"],
    variableKeys: ["customerName", "invoiceId", "amount"],
    titleKey: "communication.templates.invoiceCreated.title",
    bodyKey: "communication.templates.invoiceCreated.body",
  },
  invoice_paid: {
    key: "invoice_paid",
    notificationEvent: "payment_received",
    category: "payment",
    version: 1,
    supportedChannels: ["whatsapp", "email"],
    variableKeys: ["customerName", "amount", "invoiceId"],
    titleKey: "communication.templates.invoicePaid.title",
    bodyKey: "communication.templates.invoicePaid.body",
  },
  payment_failed: {
    key: "payment_failed",
    notificationEvent: "generic_system",
    category: "payment",
    version: 1,
    supportedChannels: ["email", "sms"],
    variableKeys: ["customerName", "amount", "reason"],
    titleKey: "communication.templates.paymentFailed.title",
    bodyKey: "communication.templates.paymentFailed.body",
  },
  birthday_greeting: {
    key: "birthday_greeting",
    notificationEvent: "generic_system",
    category: "marketing",
    version: 1,
    supportedChannels: ["whatsapp", "email", "sms"],
    variableKeys: ["customerName"],
    titleKey: "communication.templates.birthdayGreeting.title",
    bodyKey: "communication.templates.birthdayGreeting.body",
  },
  follow_up_reminder: {
    key: "follow_up_reminder",
    notificationEvent: "appointment_reminder",
    category: "booking",
    version: 1,
    supportedChannels: ["whatsapp", "email"],
    variableKeys: ["customerName", "service"],
    titleKey: "communication.templates.followUpReminder.title",
    bodyKey: "communication.templates.followUpReminder.body",
  },
  marketing_campaign: {
    key: "marketing_campaign",
    notificationEvent: "generic_system",
    category: "marketing",
    version: 1,
    supportedChannels: ["whatsapp", "email", "sms"],
    variableKeys: ["customerName", "campaignTitle", "detail"],
    titleKey: "communication.templates.marketingCampaign.title",
    bodyKey: "communication.templates.marketingCampaign.body",
  },
  customer_created: {
    key: "customer_created",
    notificationEvent: "customer_created",
    category: "customer",
    version: 1,
    supportedChannels: ["email"],
    variableKeys: ["customerName"],
    titleKey: "communication.templates.customerCreated.title",
    bodyKey: "communication.templates.customerCreated.body",
  },
};

export class CommunicationTemplateRegistry {
  resolve(key: string): CommunicationTemplateDefinition | null {
    return COMMUNICATION_TEMPLATE_REGISTRY[key] ?? null;
  }

  list(): CommunicationTemplateDefinition[] {
    return Object.values(COMMUNICATION_TEMPLATE_REGISTRY);
  }

  preview(key: string, variables: Record<string, string>): { titleKey: string; bodyKey: string; variables: Record<string, string> } | null {
    const template = this.resolve(key);
    if (!template) return null;
    return { titleKey: template.titleKey, bodyKey: template.bodyKey, variables };
  }
}

export const communicationTemplateRegistry = new CommunicationTemplateRegistry();
