import type { WorkflowDocument } from "../../core/types";
import type { TriggerCatalogEntry, TriggerConfiguration, TriggerTestPayload } from "../types/trigger-types";
import { buildTriggerPreviewPayload } from "./trigger-preview-utils";

export function buildTriggerTestPayload(
  document: WorkflowDocument,
  config: TriggerConfiguration,
  entry: TriggerCatalogEntry,
): TriggerTestPayload {
  const payload = buildTriggerPreviewPayload(document, config, entry);

  const initialVariables: Record<string, unknown> = {
    __trigger: config.legacyTriggerType ?? config.catalogId,
    "customer.name": "Preview Customer",
    "customer.phone": "+966500000000",
    "customer.email": "preview@example.com",
    "conversation.last_message": "Preview trigger test message",
    "conversation.channel": config.channel ?? entry.channel ?? "preview",
  };

  if (payload.customer && typeof payload.customer === "object") {
    const customer = payload.customer as Record<string, unknown>;
    if (customer.name) initialVariables["customer.name"] = customer.name;
    if (customer.phone) initialVariables["customer.phone"] = customer.phone;
    if (customer.email) initialVariables["customer.email"] = customer.email;
  }

  if (payload.booking && typeof payload.booking === "object") {
    const booking = payload.booking as Record<string, unknown>;
    if (booking.id) initialVariables["booking.id"] = booking.id;
    if (booking.status) initialVariables["booking.status"] = booking.status;
  }

  if (payload.payment && typeof payload.payment === "object") {
    const payment = payload.payment as Record<string, unknown>;
    if (payment.status) initialVariables["payment.status"] = payment.status;
    if (payment.amount) initialVariables["payment.amount"] = payment.amount;
  }

  if (payload.event) {
    initialVariables["event.name"] = payload.event;
  }

  return {
    label: `trigger-test:${config.catalogId}`,
    initialVariables,
  };
}
