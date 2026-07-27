import type { NotificationTemplate } from "@/lib/notifications/types";

export const NOTIFICATION_TEMPLATE_REGISTRY: Record<string, NotificationTemplate> = {
  appointment_created: {
    key: "appointment_created",
    event: "appointment_created",
    titleKey: "notifications.platform.templates.appointmentCreated.title",
    messageKey: "notifications.platform.templates.appointmentCreated.message",
    defaultPriority: "normal",
    defaultChannel: "in_app",
    category: "booking",
    visualType: "info",
  },
  appointment_updated: {
    key: "appointment_updated",
    event: "appointment_updated",
    titleKey: "notifications.platform.templates.appointmentUpdated.title",
    messageKey: "notifications.platform.templates.appointmentUpdated.message",
    defaultPriority: "normal",
    defaultChannel: "in_app",
    category: "booking",
    visualType: "info",
  },
  appointment_cancelled: {
    key: "appointment_cancelled",
    event: "appointment_cancelled",
    titleKey: "notifications.platform.templates.appointmentCancelled.title",
    messageKey: "notifications.platform.templates.appointmentCancelled.message",
    defaultPriority: "high",
    defaultChannel: "in_app",
    category: "booking",
    visualType: "warning",
  },
  appointment_reminder: {
    key: "appointment_reminder",
    event: "appointment_reminder",
    titleKey: "notifications.platform.templates.appointmentReminder.title",
    messageKey: "notifications.platform.templates.appointmentReminder.message",
    defaultPriority: "normal",
    defaultChannel: "in_app",
    category: "booking",
    visualType: "info",
  },
  customer_created: {
    key: "customer_created",
    event: "customer_created",
    titleKey: "notifications.platform.templates.customerCreated.title",
    messageKey: "notifications.platform.templates.customerCreated.message",
    defaultPriority: "low",
    defaultChannel: "in_app",
    category: "customer",
    visualType: "success",
  },
  invoice_created: {
    key: "invoice_created",
    event: "invoice_created",
    titleKey: "notifications.platform.templates.invoiceCreated.title",
    messageKey: "notifications.platform.templates.invoiceCreated.message",
    defaultPriority: "normal",
    defaultChannel: "in_app",
    category: "invoice",
    visualType: "info",
  },
  payment_received: {
    key: "payment_received",
    event: "payment_received",
    titleKey: "notifications.platform.templates.paymentReceived.title",
    messageKey: "notifications.platform.templates.paymentReceived.message",
    defaultPriority: "normal",
    defaultChannel: "in_app",
    category: "payment",
    visualType: "success",
  },
  generic_system: {
    key: "generic_system",
    event: "generic_system",
    titleKey: "notifications.platform.templates.genericSystem.title",
    messageKey: "notifications.platform.templates.genericSystem.message",
    defaultPriority: "low",
    defaultChannel: "in_app",
    category: "system",
    visualType: "info",
  },
};

export class NotificationTemplateRegistry {
  resolve(event: string): NotificationTemplate | null {
    return NOTIFICATION_TEMPLATE_REGISTRY[event] ?? null;
  }

  list(): NotificationTemplate[] {
    return Object.values(NOTIFICATION_TEMPLATE_REGISTRY);
  }
}

export const notificationTemplateRegistry = new NotificationTemplateRegistry();
