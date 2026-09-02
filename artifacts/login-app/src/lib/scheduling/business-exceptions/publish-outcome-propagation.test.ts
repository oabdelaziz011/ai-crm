import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.VITE_SUPABASE_URL ??= "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??= "test-publishable-key";

import { toPublishOutcome } from "../../communication/events/domain-event-bridge.ts";
import { BookingBillingBridge } from "../../billing/events/booking-billing-bridge.ts";
import type { BookingDomainEvent, BookingPublishOutcome } from "../booking-domain/events.ts";
import { BusinessAppointmentExceptionService } from "./business-appointment-exception-service.ts";

const cancelledEvent = {
  type: "BookingCancelled",
  occurredAt: new Date().toISOString(),
  payload: {
    booking: {
      id: "b1",
      company_id: "co-1",
      customer_id: "c1",
      service_id: "svc-1",
      resource_id: "r1",
      start_at: "2026-08-05T10:00:00.000Z",
      end_at: "2026-08-05T10:30:00.000Z",
      timezone: "UTC",
      status: "cancelled",
      notes: null,
      updated_at: "2026-08-05T09:00:00.000Z",
    },
    reason: "clinic_closed",
    customerMessage: "نعتذر",
  },
} as BookingDomainEvent;

describe("toPublishOutcome WhatsApp specificity", () => {
  it("uses only WhatsApp channel queue id", () => {
    const outcome = toPublishOutcome({
      messageIds: ["n1", "n2"],
      queueIds: ["email-q", "wa-q"],
      channelQueueIds: { email: "email-q", whatsapp: "wa-q" },
      skippedChannels: [],
      failedChannels: [],
      deduplicated: false,
    });
    assert.deepEqual(outcome.whatsappQueueIds, ["wa-q"]);
    assert.equal(outcome.whatsappSkipped, false);
    assert.equal(outcome.ok, true);
  });

  it("keeps WhatsApp queued when email failed", () => {
    const outcome = toPublishOutcome({
      messageIds: ["n-wa"],
      queueIds: ["wa-q"],
      channelQueueIds: { whatsapp: "wa-q" },
      skippedChannels: [],
      failedChannels: ["email"],
      deduplicated: false,
    });
    assert.deepEqual(outcome.whatsappQueueIds, ["wa-q"]);
    assert.equal(outcome.ok, true);
  });

  it("marks WhatsApp failed without inventing email queue as WhatsApp", () => {
    const outcome = toPublishOutcome({
      messageIds: ["n-email"],
      queueIds: ["email-q"],
      channelQueueIds: { email: "email-q" },
      skippedChannels: [],
      failedChannels: ["whatsapp"],
      deduplicated: false,
    });
    assert.deepEqual(outcome.whatsappQueueIds, []);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error, "whatsapp_enqueue_failed");
  });
});

describe("publisher chain preserves BookingPublishOutcome", () => {
  it("BookingBillingBridge returns inner WhatsApp outcome", async () => {
    const innerOutcome: BookingPublishOutcome = {
      ok: true,
      whatsappQueueIds: ["q-inner"],
      whatsappSkipped: false,
    };
    const bridge = new BookingBillingBridge(
      {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      } as never,
      { createDraft: async () => ({ id: "inv" }), issue: async () => undefined } as never,
      { publish: async () => innerOutcome },
    );

    const result = await bridge.publish(cancelledEvent);
    assert.deepEqual(result, innerOutcome);
  });

  it("IntegrationBookingEventPublisher returns inner outcome", async () => {
    process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
    process.env.VITE_SUPABASE_ANON_KEY = "test-anon-key";
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
    const { IntegrationBookingEventPublisher } = await import(
      "../../integration/events/enterprise-event-publisher.ts"
    );
    const innerOutcome: BookingPublishOutcome = {
      ok: true,
      whatsappQueueIds: ["q-int"],
      whatsappSkipped: false,
    };
    const publisher = new IntegrationBookingEventPublisher({
      publish: async () => innerOutcome,
    });
    const result = await publisher.publish(cancelledEvent);
    assert.deepEqual(result, innerOutcome);
  });

  it("IntegrationBookingEventPublisher returns failed outcome when inner throws", async () => {
    process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
    process.env.VITE_SUPABASE_ANON_KEY = "test-anon-key";
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
    const { IntegrationBookingEventPublisher } = await import(
      "../../integration/events/enterprise-event-publisher.ts"
    );
    const publisher = new IntegrationBookingEventPublisher({
      publish: async () => {
        throw new Error("boom");
      },
    });
    const result = await publisher.publish(cancelledEvent);
    assert.equal(result && typeof result === "object" ? result.ok : true, false);
    assert.equal(result && typeof result === "object" ? result.error : null, "boom");
  });
});

describe("apology service uses propagated publishOutcome", () => {
  function createMock(publishOutcome: BookingPublishOutcome | null) {
    const bookings = [
      {
        id: "b1",
        company_id: "co-1",
        customer_id: "c1",
        service_id: "svc-1",
        start_at: "2026-08-05T10:00:00.000Z",
        end_at: "2026-08-05T10:30:00.000Z",
        status: "confirmed",
        timezone: "UTC",
      },
    ];
    const items: Array<Record<string, unknown>> = [];
    let existingException: Record<string, unknown> | null = null;

    const from = (table: string) => {
      if (table === "scheduling_services") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({
                    data: { id: "svc-1", status: "active", name: "S" },
                    error: null,
                  }),
                }),
                maybeSingle: async () => ({
                  data: { id: "svc-1", status: "active", name: "S" },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "scheduling_booking_rules") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { timezone: "UTC" }, error: null }) }),
          }),
        };
      }
      if (table === "scheduling_bookings") {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        Object.assign(chain, {
          select: self,
          eq: self,
          is: self,
          in: self,
          lt: self,
          gt: self,
          order: async () => ({ data: bookings, error: null }),
          maybeSingle: async () => ({ data: bookings[0], error: null }),
        });
        return chain;
      }
      if (table === "customers") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { phone: "+966500000001" }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "business_appointment_exceptions") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: existingException, error: null }) }),
            }),
          }),
          insert: (values: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                existingException = {
                  id: "exc-1",
                  company_id: "co-1",
                  status: "pending",
                  affected_appointments_count: 1,
                  cancelled_appointments_count: 0,
                  notification_queued_count: 0,
                  notification_sent_count: 0,
                  notification_failed_count: 0,
                  notification_skipped_count: 0,
                  ...values,
                };
                return { data: existingException, error: null };
              },
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: () => ({
              eq: () => {
                existingException = {
                  ...(existingException as object),
                  ...patch,
                  id: "exc-1",
                  company_id: "co-1",
                };
                return {
                  select: () => ({
                    single: async () => ({ data: existingException, error: null }),
                  }),
                  then: (resolve: (v: unknown) => unknown) =>
                    resolve({ data: existingException, error: null }),
                };
              },
            }),
          }),
        };
      }
      if (table === "business_appointment_exception_items") {
        return {
          select: () => {
            const filters: Record<string, unknown> = {};
            const chain: Record<string, unknown> = {};
            chain.eq = (col: string, val: unknown) => {
              filters[col] = val;
              return chain;
            };
            chain.in = () => chain;
            chain.limit = () => chain;
            chain.maybeSingle = async () => ({ data: null, error: null });
            chain.then = (resolve: (v: unknown) => unknown) =>
              resolve({
                data: items.filter(
                  (row) => !filters.exception_id || row.exception_id === filters.exception_id,
                ),
                error: null,
              });
            return chain;
          },
          insert: (values: Record<string, unknown>) => {
            const row = {
              id: `item-${items.length + 1}`,
              notification_queue_id: null,
              provider_message_id: null,
              error_message: null,
              ...values,
            };
            items.push(row);
            return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
          },
          update: (patch: Record<string, unknown>) => ({
            eq: (col: string, val: unknown) => ({
              eq: () => {
                const target = items.find((row) => row[col] === val);
                if (target) Object.assign(target, patch);
                return { then: (resolve: (v: unknown) => unknown) => resolve({ error: null }) };
              },
            }),
          }),
        };
      }
      throw new Error(table);
    };

    return {
      client: { from } as never,
      items,
      bookingDomain: {
        cancelBooking: async () => ({
          booking: { ...bookings[0], status: "cancelled" },
          publishOutcome,
        }),
      },
      notesFactory: () => ({ create: async () => ({ id: "n1" }) }) as never,
    };
  }

  it("successful queue → notification_status queued + queue id persisted", async () => {
    const mock = createMock({
      ok: true,
      whatsappQueueIds: ["q-real"],
      whatsappSkipped: false,
    });
    const service = new BusinessAppointmentExceptionService(
      mock.client,
      mock.bookingDomain as never,
      mock.notesFactory,
    );
    const result = await service.execute(
      { companyId: "co-1", actorUserId: "u1", isSuperAdmin: true, hasPermission: () => true },
      {
        serviceId: "svc-1",
        exceptionDate: "2026-08-05",
        scope: "full_day",
        comment: "نعتذر عن عدم قدرتنا على استقبالكم اليوم لظروف طارئة.",
        idempotencyKey: "propagate-1",
      },
    );
    assert.equal(mock.items[0]?.notification_status, "queued");
    assert.equal(mock.items[0]?.notification_queue_id, "q-real");
    assert.equal(result.notificationQueuedCount, 1);
    assert.equal(result.notificationSentCount, 0);
  });

  it("null publishOutcome → failed (not silent success)", async () => {
    const mock = createMock(null);
    const service = new BusinessAppointmentExceptionService(
      mock.client,
      mock.bookingDomain as never,
      mock.notesFactory,
    );
    await service.execute(
      { companyId: "co-1", actorUserId: "u1", isSuperAdmin: true, hasPermission: () => true },
      {
        serviceId: "svc-1",
        exceptionDate: "2026-08-05",
        scope: "full_day",
        comment: "Closed",
        idempotencyKey: "propagate-null",
      },
    );
    assert.equal(mock.items[0]?.notification_status, "failed");
    assert.equal(mock.items[0]?.error_message, "notification_publish_unavailable");
  });
});
