import type { WorkflowDocument } from "../../core/types";
import type { TriggerCatalogEntry, TriggerConfiguration } from "../types/trigger-types";

export function buildTriggerPreviewPayload(
  document: WorkflowDocument,
  config: TriggerConfiguration,
  entry: TriggerCatalogEntry,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    flowId: document.flowId,
    companyId: document.companyId,
    triggerType: document.triggerType,
    catalogId: config.catalogId,
    __trigger: config.legacyTriggerType ?? config.catalogId,
  };

  if (entry.businessEvent) {
    base.event = entry.businessEvent;
  }

  if (config.customEventName?.trim()) {
    base.event = config.customEventName.trim();
  }

  if (config.channel ?? entry.channel) {
    base.channel = config.channel ?? entry.channel;
    base.message = {
      type: "text",
      text: "Preview message — not sent to production.",
      externalUserId: "preview-user",
    };
  }

  if (config.catalogId === "schedule") {
    base.schedule = {
      cronExpression: config.cronExpression ?? "",
      timezone: config.timezone ?? "UTC",
    };
  }

  if (config.catalogId === "webhook") {
    base.webhook = {
      path: config.webhookPath ?? "",
      method: "POST",
    };
  }

  if (config.catalogId === "rest_api") {
    base.api = {
      method: "POST",
      authHint: config.apiAuthHint ?? "",
    };
  }

  if (config.catalogId.startsWith("booking_")) {
    base.booking = {
      id: "booking_preview_01",
      status: config.catalogId === "booking_cancelled" ? "cancelled" : "confirmed",
      serviceName: "Consultation",
      startsAt: new Date().toISOString(),
    };
  }

  if (config.catalogId.startsWith("customer_")) {
    base.customer = {
      id: "cust_preview_01",
      name: "Preview Customer",
      email: "preview@example.com",
      phone: "+966500000000",
    };
  }

  if (config.catalogId.startsWith("payment_")) {
    base.payment = {
      id: "pay_preview_01",
      amount: 150,
      currency: "SAR",
      status: config.catalogId === "payment_failed" ? "failed" : "received",
    };
  }

  if (config.catalogId.startsWith("ticket_")) {
    base.ticket = {
      id: "ticket_preview_01",
      subject: "Preview support ticket",
      status: config.catalogId === "ticket_closed" ? "closed" : "open",
    };
  }

  if (config.eventFilters && Object.keys(config.eventFilters).length > 0) {
    base.filters = config.eventFilters;
  }

  return base;
}
