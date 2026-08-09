import { describe, expect, it } from "vitest";
import {
  isCommunicationEventOrTemplateKey,
  localizeCommunicationChannel,
  localizeCommunicationRecipient,
  localizeCommunicationStatus,
  localizeCommunicationTemplate,
  resolveDisplayTemplateKey,
} from "@/lib/communication/utilities/communication-localize";

const catalog: Record<string, string> = {
  "communication.channels.whatsapp": "WhatsApp",
  "communication.channels.inApp": "In-app notification",
  "communication.channels.unknown": "Unknown channel",
  "communication.statuses.queued": "Queued",
  "communication.statuses.failed": "Failed",
  "communication.history.recipientInternal": "Internal / system",
  "notifications.platform.events.customer_created": "Customer created",
  "communication.templates.bookingCreated.title": "Booking Created",
};

const t = (key: string) => catalog[key] ?? key;

describe("communication-localize", () => {
  it("localizes channels including in_app", () => {
    expect(localizeCommunicationChannel(t, "in_app")).toBe("In-app notification");
    expect(localizeCommunicationChannel(t, "whatsapp")).toBe("WhatsApp");
  });

  it("localizes statuses", () => {
    expect(localizeCommunicationStatus(t, "queued")).toBe("Queued");
    expect(localizeCommunicationStatus(t, "failed")).toBe("Failed");
  });

  it("localizes template and notification event keys", () => {
    expect(localizeCommunicationTemplate(t, "customer_created")).toBe("Customer created");
    expect(localizeCommunicationTemplate(t, "booking_created")).toBe("Booking Created");
  });

  it("treats event keys as internal recipients", () => {
    expect(isCommunicationEventOrTemplateKey("customer_created")).toBe(true);
    expect(localizeCommunicationRecipient(t, "customer_created", "")).toBe("Internal / system");
    expect(resolveDisplayTemplateKey("", "customer_created")).toBe("customer_created");
  });
});
