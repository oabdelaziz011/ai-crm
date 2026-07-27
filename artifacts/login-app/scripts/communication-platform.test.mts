import assert from "node:assert/strict";
import { CommunicationDispatcher } from "../src/lib/communication/dispatcher/communication-dispatcher.ts";
import { CommunicationPreferenceService } from "../src/lib/communication/preferences/communication-preference-service.ts";
import { CustomerCommunicationPreferencesRepository } from "../src/lib/communication/preferences/customer-communication-preferences-repository.ts";
import { communicationTemplateRegistry } from "../src/lib/communication/templates/communication-template-registry.ts";
import { ReminderScheduler } from "../src/lib/communication/scheduler/reminder-scheduler.ts";
import { ReminderScheduleRepository } from "../src/lib/communication/scheduler/reminder-scheduler.ts";
import { mapDbStatusToCommunication } from "../src/lib/communication/utilities/queue-status-mapper.ts";
import { buildCommunicationDedupeKey } from "../src/lib/communication/utilities/dedupe-key.ts";
import { computeExponentialBackoffMs } from "../src/lib/communication/utilities/retry-policy.ts";
import type { CommunicationProvider, ProviderSendOutcome } from "../src/lib/communication/providers/communication-provider.ts";

class StubProvider implements CommunicationProvider {
  readonly providerName = "stub";
  sent: number[] = [];
  constructor(readonly channel: "email" | "whatsapp") {}
  async send(): Promise<ProviderSendOutcome> {
    this.sent.push(1);
    return { status: "queued", notificationId: "n1" };
  }
}

{
  const template = communicationTemplateRegistry.resolve("booking_created");
  assert.ok(template);
  assert.equal(template.notificationEvent, "appointment_created");
}

{
  const key = buildCommunicationDedupeKey({
    companyId: "c1",
    templateKey: "booking_created",
    channels: ["email"],
    recipient: { customerId: "cust1" },
  });
  assert.ok(key.includes("booking_created"));
}

{
  assert.equal(mapDbStatusToCommunication("pending", 0), "queued");
  assert.equal(mapDbStatusToCommunication("failed", 2), "retrying");
  assert.equal(mapDbStatusToCommunication("completed", 0, true), "delivered");
}

{
  const scheduler = new ReminderScheduler({
    listDue: async () => [],
    create: async (input) => ({ ...input, id: "r1", status: "pending" as const }),
    markSent: async () => {},
    cancelByReference: async () => {},
  } as unknown as ReminderScheduleRepository);

  const at = scheduler.computeScheduledAt("2026-07-27T12:00:00.000Z", "1h_before");
  assert.equal(at, "2026-07-27T11:00:00.000Z");
}

{
  assert.equal(computeExponentialBackoffMs(1), 30_000);
  assert.equal(computeExponentialBackoffMs(3), 120_000);
}

console.log("communication-platform.test.mts: all assertions passed");
