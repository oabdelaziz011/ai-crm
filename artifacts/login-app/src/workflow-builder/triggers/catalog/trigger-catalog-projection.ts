import { TRIGGER_DEFINITIONS } from "@/lib/automation/triggers/trigger-registry";
import { TRIGGER_TO_BUSINESS_EVENT } from "@/lib/automation/types/automation-enums";
import { AUTOMATION_TRIGGER_TYPES } from "@workspace/automation-platform";
import type {
  TriggerCatalogEntry,
  TriggerCatalogId,
  TriggerCategory,
  TriggerClassification,
  TriggerChannel,
  TriggerConfiguration,
} from "../types/trigger-types";

export type PlatformTriggerType = (typeof AUTOMATION_TRIGGER_TYPES)[number];

type CatalogSourceEntry = {
  id: TriggerCatalogId;
  category: TriggerCategory;
  classification: TriggerClassification;
  platformTriggerType: PlatformTriggerType;
  labelKey: string;
  descriptionKey: string;
  channel?: TriggerChannel;
  legacyTriggerType?: keyof typeof TRIGGER_DEFINITIONS;
  businessEvent?: string | null;
  requiresChannelBinding?: boolean;
};

/** Builder-only overlays; labels/descriptions map to i18n keys under workflowBuilder.triggers.types */
const BUILDER_CATALOG_SOURCE: CatalogSourceEntry[] = [
  {
    id: "manual",
    category: "system",
    classification: "executable",
    platformTriggerType: "manual",
    labelKey: "manual",
    descriptionKey: "manualDescription",
  },
  {
    id: "rest_api",
    category: "api",
    classification: "executable",
    platformTriggerType: "api_event",
    labelKey: "restApi",
    descriptionKey: "restApiDescription",
  },
  {
    id: "inbound_message",
    category: "messaging",
    classification: "executable",
    platformTriggerType: "inbound_message",
    labelKey: "inboundMessage",
    descriptionKey: "inboundMessageDescription",
  },
  {
    id: "whatsapp",
    category: "messaging",
    classification: "executable",
    platformTriggerType: "inbound_message",
    labelKey: "whatsapp",
    descriptionKey: "whatsappDescription",
    channel: "whatsapp",
    requiresChannelBinding: true,
  },
  {
    id: "facebook_messenger",
    category: "messaging",
    classification: "executable",
    platformTriggerType: "inbound_message",
    labelKey: "facebookMessenger",
    descriptionKey: "facebookMessengerDescription",
    channel: "messenger",
    requiresChannelBinding: true,
  },
  {
    id: "instagram",
    category: "messaging",
    classification: "executable",
    platformTriggerType: "inbound_message",
    labelKey: "instagram",
    descriptionKey: "instagramDescription",
    channel: "instagram",
    requiresChannelBinding: true,
  },
  {
    id: "email",
    category: "messaging",
    classification: "executable",
    platformTriggerType: "inbound_message",
    labelKey: "email",
    descriptionKey: "emailDescription",
    channel: "email",
    requiresChannelBinding: true,
  },
  {
    id: "customer_created",
    category: "crm",
    classification: "executable",
    platformTriggerType: "api_event",
    labelKey: "customerCreated",
    descriptionKey: "customerCreatedDescription",
    legacyTriggerType: "customer_created",
  },
  {
    id: "customer_updated",
    category: "crm",
    classification: "executable",
    platformTriggerType: "api_event",
    labelKey: "customerUpdated",
    descriptionKey: "customerUpdatedDescription",
    businessEvent: "customer.updated",
  },
  {
    id: "booking_created",
    category: "bookings",
    classification: "executable",
    platformTriggerType: "api_event",
    labelKey: "bookingCreated",
    descriptionKey: "bookingCreatedDescription",
    legacyTriggerType: "appointment_created",
  },
  {
    id: "booking_updated",
    category: "bookings",
    classification: "executable",
    platformTriggerType: "api_event",
    labelKey: "bookingUpdated",
    descriptionKey: "bookingUpdatedDescription",
    legacyTriggerType: "appointment_updated",
  },
  {
    id: "booking_cancelled",
    category: "bookings",
    classification: "executable",
    platformTriggerType: "api_event",
    labelKey: "bookingCancelled",
    descriptionKey: "bookingCancelledDescription",
    legacyTriggerType: "appointment_cancelled",
  },
  {
    id: "payment_received",
    category: "payments",
    classification: "executable",
    platformTriggerType: "api_event",
    labelKey: "paymentReceived",
    descriptionKey: "paymentReceivedDescription",
    legacyTriggerType: "invoice_paid",
  },
  {
    id: "payment_failed",
    category: "payments",
    classification: "executable",
    platformTriggerType: "api_event",
    labelKey: "paymentFailed",
    descriptionKey: "paymentFailedDescription",
    businessEvent: "payment.failed",
  },
  {
    id: "schedule",
    category: "scheduling",
    classification: "configuration_only",
    platformTriggerType: "schedule",
    labelKey: "schedule",
    descriptionKey: "scheduleDescription",
  },
  {
    id: "webhook",
    category: "api",
    classification: "configuration_only",
    platformTriggerType: "webhook",
    labelKey: "webhook",
    descriptionKey: "webhookDescription",
  },
  {
    id: "sms",
    category: "messaging",
    classification: "configuration_only",
    platformTriggerType: "inbound_message",
    labelKey: "sms",
    descriptionKey: "smsDescription",
    channel: "sms",
    requiresChannelBinding: true,
  },
  {
    id: "ticket_created",
    category: "system",
    classification: "configuration_only",
    platformTriggerType: "api_event",
    labelKey: "ticketCreated",
    descriptionKey: "ticketCreatedDescription",
    businessEvent: "ticket.created",
  },
  {
    id: "ticket_updated",
    category: "system",
    classification: "configuration_only",
    platformTriggerType: "api_event",
    labelKey: "ticketUpdated",
    descriptionKey: "ticketUpdatedDescription",
    businessEvent: "ticket.updated",
  },
  {
    id: "ticket_closed",
    category: "system",
    classification: "configuration_only",
    platformTriggerType: "api_event",
    labelKey: "ticketClosed",
    descriptionKey: "ticketClosedDescription",
    businessEvent: "ticket.closed",
  },
  {
    id: "custom_event",
    category: "system",
    classification: "configuration_only",
    platformTriggerType: "api_event",
    labelKey: "customEvent",
    descriptionKey: "customEventDescription",
    legacyTriggerType: "custom_event",
  },
];

function resolveBusinessEvent(source: CatalogSourceEntry): string | null | undefined {
  if (source.businessEvent !== undefined) return source.businessEvent;
  if (!source.legacyTriggerType) return undefined;
  return TRIGGER_TO_BUSINESS_EVENT[source.legacyTriggerType] ?? TRIGGER_DEFINITIONS[source.legacyTriggerType]?.businessEvent;
}

export function projectTriggerCatalog(): TriggerCatalogEntry[] {
  return BUILDER_CATALOG_SOURCE.map((source) => ({
    id: source.id,
    category: source.category,
    classification: source.classification,
    platformTriggerType: source.platformTriggerType,
    channel: source.channel,
    legacyTriggerType: source.legacyTriggerType,
    businessEvent: resolveBusinessEvent(source),
    labelKey: source.labelKey,
    descriptionKey: source.descriptionKey,
    requiresChannelBinding: source.requiresChannelBinding,
  }));
}

export function createTriggerConfigurationFromEntry(entry: TriggerCatalogEntry): TriggerConfiguration {
  return {
    catalogId: entry.id,
    channel: entry.channel,
    legacyTriggerType: entry.legacyTriggerType,
    businessEvent: entry.businessEvent,
    customEventName: entry.id === "custom_event" ? "" : undefined,
    cronExpression: entry.id === "schedule" ? "" : undefined,
    timezone: entry.id === "schedule" ? "UTC" : undefined,
    webhookPath: entry.id === "webhook" ? "" : undefined,
    apiAuthHint: entry.platformTriggerType === "api_event" && entry.id === "rest_api" ? "" : undefined,
    eventFilters: {},
  };
}

export function inferCatalogIdFromPlatformTrigger(triggerType: PlatformTriggerType): TriggerCatalogId {
  switch (triggerType) {
    case "manual":
      return "manual";
    case "api_event":
      return "rest_api";
    case "webhook":
      return "webhook";
    case "schedule":
      return "schedule";
    default:
      return "inbound_message";
  }
}

export function listTriggerCategories(): TriggerCategory[] {
  return ["messaging", "crm", "bookings", "payments", "api", "scheduling", "system"];
}

export { AUTOMATION_TRIGGER_TYPES as PLATFORM_TRIGGER_TYPES };
