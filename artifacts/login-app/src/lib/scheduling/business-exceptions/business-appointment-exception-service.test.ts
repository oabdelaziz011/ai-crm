import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BusinessAppointmentExceptionService } from "./business-appointment-exception-service.ts";
import { BusinessApologyExceptionError } from "./types.ts";
import { reconcileBusinessExceptionNotification } from "./reconcile-exception-notification.ts";
import { createBookingCancelledEvent } from "../booking-domain/events.ts";

type ItemRow = Record<string, unknown>;

function createMockClient(overrides?: {
  service?: { id: string; status: string } | null;
  bookings?: Array<Record<string, unknown>>;
  existingException?: Record<string, unknown> | null;
  customerPhone?: string | null;
  items?: ItemRow[];
  uniqueClaimFailBookingIds?: string[];
}) {
  const service = overrides?.service ?? { id: "svc-1", status: "active" };
  const bookings = overrides?.bookings ?? [];
  let existingException = overrides?.existingException ?? null;
  const customerPhone = overrides?.customerPhone ?? "+966500000000";
  const items: ItemRow[] = [...(overrides?.items ?? [])];
  const uniqueClaimFail = new Set(overrides?.uniqueClaimFailBookingIds ?? []);
  let cancelCalls = 0;
  let lastCancelInput: Record<string, unknown> | null = null;
  const publishOutcomes: Array<Record<string, unknown> | null> = [];

  const from = (table: string) => {
    if (table === "scheduling_services") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({ data: service, error: null }),
              }),
              maybeSingle: async () => ({ data: service, error: null }),
            }),
          }),
        }),
      };
    }
    if (table === "scheduling_booking_rules") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { timezone: "UTC" }, error: null }),
          }),
        }),
      };
    }
    if (table === "scheduling_bookings") {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = (..._args: unknown[]) => {
        // status lookup after cancel failure / resume
        if (typeof chain._mode === "string") return chain;
        return chain;
      };
      chain.is = self;
      chain.in = self;
      chain.lt = self;
      chain.gt = self;
      chain.order = async () => ({ data: bookings, error: null });
      chain.maybeSingle = async () => {
        const booking = bookings[0] ?? null;
        return { data: booking, error: null };
      };
      return chain;
    }
    if (table === "customers") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { phone: customerPhone },
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    if (table === "business_appointment_exceptions") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: existingException, error: null }),
            }),
          }),
        }),
        insert: (values: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              existingException = {
                id: "exc-1",
                company_id: "co-1",
                status: "pending",
                affected_appointments_count: bookings.length,
                cancelled_appointments_count: 0,
                notification_queued_count: 0,
                notification_sent_count: 0,
                notification_failed_count: 0,
                notification_skipped_count: 0,
                idempotency_key: values.idempotency_key,
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
                ...(existingException as Record<string, unknown>),
                ...patch,
                id: (existingException as { id?: string } | null)?.id ?? "exc-1",
                company_id: "co-1",
              };
              return {
                select: () => ({
                  single: async () => ({
                    data: existingException,
                    error: null,
                  }),
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
          const self = () => chain;
          chain.eq = (col: string, val: unknown) => {
            filters[col] = val;
            return chain;
          };
          chain.in = self;
          chain.limit = self;
          chain.maybeSingle = async () => {
            const found = items.find((row) => {
              if (filters.id && row.id !== filters.id) return false;
              if (filters.booking_id && row.booking_id !== filters.booking_id) return false;
              if (filters.notification_queue_id && row.notification_queue_id !== filters.notification_queue_id)
                return false;
              if (filters.exception_id && row.exception_id !== filters.exception_id) return false;
              if (
                filters.cancellation_status &&
                row.cancellation_status !== filters.cancellation_status
              ) {
                return false;
              }
              return true;
            });
            return { data: found ?? null, error: null };
          };
          // listItemsForException ends without maybeSingle — supabase returns thenable from select chain.
          // Our repo awaits the builder after eq eq — need thenable.
          chain.then = (resolve: (v: unknown) => unknown) =>
            resolve({
              data: items.filter((row) => {
                if (filters.exception_id && row.exception_id !== filters.exception_id) return false;
                if (filters.company_id && row.company_id !== filters.company_id) return false;
                return true;
              }),
              error: null,
            });
          return chain;
        },
        insert: (values: Record<string, unknown>) => {
          if (
            values.cancellation_status === "pending" &&
            uniqueClaimFail.has(String(values.booking_id))
          ) {
            return {
              select: () => ({
                single: async () => ({
                  data: null,
                  error: { code: "23505", message: "duplicate key" },
                }),
              }),
            };
          }
          const row = {
            id: `item-${items.length + 1}`,
            notification_queue_id: null,
            provider_message_id: null,
            error_message: null,
            ...values,
          };
          items.push(row);
          return {
            select: () => ({
              single: async () => ({ data: row, error: null }),
            }),
          };
        },
        update: (patch: Record<string, unknown>) => ({
          eq: (col: string, val: unknown) => ({
            eq: () => {
              const target = items.find((row) => row[col] === val);
              if (target) Object.assign(target, patch);
              return {
                then: (resolve: (v: unknown) => unknown) => resolve({ error: null }),
              };
            },
          }),
        }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  };

  return {
    client: { from } as never,
    getCancelCalls: () => cancelCalls,
    getLastCancelInput: () => lastCancelInput,
    getItems: () => items,
    getException: () => existingException,
    setPublishOutcome: (outcome: Record<string, unknown> | null) => {
      publishOutcomes.push(outcome);
    },
    bookingDomain: {
      cancelBooking: async (input: Record<string, unknown>) => {
        cancelCalls += 1;
        lastCancelInput = input;
        const outcome =
          publishOutcomes.length > 0
            ? publishOutcomes.shift()
            : {
                ok: true,
                whatsappQueueIds: ["queue-1"],
                whatsappSkipped: false,
              };
        return {
          booking: { ...bookings[0], status: "cancelled" },
          publishOutcome: outcome,
        };
      },
    },
    notesFactory: () =>
      ({
        create: async () => ({ id: "note-1" }),
      }) as never,
  };
}

describe("BusinessAppointmentExceptionService", () => {
  it("rejects unauthorized execute", async () => {
    const { client, bookingDomain, notesFactory } = createMockClient();
    const service = new BusinessAppointmentExceptionService(
      client,
      bookingDomain as never,
      notesFactory,
    );
    await assert.rejects(
      () =>
        service.execute(
          {
            companyId: "co-1",
            actorUserId: "user-1",
            isSuperAdmin: false,
            hasPermission: () => false,
          },
          {
            serviceId: "svc-1",
            exceptionDate: "2026-08-05",
            scope: "full_day",
            comment: "Closed",
            idempotencyKey: "k1",
          },
        ),
      (error: unknown) => error instanceof BusinessApologyExceptionError,
    );
  });

  it("preview counts matching appointments only", async () => {
    const { client, bookingDomain, notesFactory } = createMockClient({
      bookings: [
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
      ],
    });
    const service = new BusinessAppointmentExceptionService(
      client,
      bookingDomain as never,
      notesFactory,
    );
    const preview = await service.preview(
      {
        companyId: "co-1",
        actorUserId: "user-1",
        isSuperAdmin: true,
        hasPermission: () => true,
      },
      {
        serviceId: "svc-1",
        exceptionDate: "2026-08-05",
        scope: "full_day",
        comment: "Closed",
      },
    );
    assert.equal(preview.affectedAppointmentsCount, 1);
    assert.equal(preview.affectedCustomersCount, 1);
  });

  it("zero affected does not call cancelBooking", async () => {
    const { client, bookingDomain, getCancelCalls, notesFactory } = createMockClient({
      bookings: [],
    });
    const service = new BusinessAppointmentExceptionService(
      client,
      bookingDomain as never,
      notesFactory,
    );
    const result = await service.execute(
      {
        companyId: "co-1",
        actorUserId: "user-1",
        isSuperAdmin: true,
        hasPermission: () => true,
      },
      {
        serviceId: "svc-1",
        exceptionDate: "2026-08-05",
        scope: "full_day",
        comment: "Closed for maintenance",
        idempotencyKey: "zero-1",
      },
    );
    assert.equal(result.affectedAppointmentsCount, 0);
    assert.equal(result.messageKey, "zero_affected");
    assert.equal(getCancelCalls(), 0);
  });

  it("reuses completed idempotent exception", async () => {
    const { client, bookingDomain, getCancelCalls, notesFactory } = createMockClient({
      existingException: {
        id: "exc-existing",
        status: "completed",
        affected_appointments_count: 3,
        cancelled_appointments_count: 3,
        notification_queued_count: 2,
        notification_sent_count: 0,
        notification_failed_count: 0,
        notification_skipped_count: 1,
      },
    });
    const service = new BusinessAppointmentExceptionService(
      client,
      bookingDomain as never,
      notesFactory,
    );
    const result = await service.execute(
      {
        companyId: "co-1",
        actorUserId: "user-1",
        isSuperAdmin: true,
        hasPermission: () => true,
      },
      {
        serviceId: "svc-1",
        exceptionDate: "2026-08-05",
        scope: "full_day",
        comment: "Closed",
        idempotencyKey: "same-key",
      },
    );
    assert.equal(result.reusedExisting, true);
    assert.equal(result.exceptionId, "exc-existing");
    assert.equal(getCancelCalls(), 0);
  });

  it("records queued not sent when WhatsApp is only enqueued", async () => {
    const mock = createMockClient({
      bookings: [
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
      ],
    });
    mock.setPublishOutcome({
      ok: true,
      whatsappQueueIds: ["q-abc"],
      whatsappSkipped: false,
    });
    const service = new BusinessAppointmentExceptionService(
      mock.client,
      mock.bookingDomain as never,
      mock.notesFactory,
    );
    const result = await service.execute(
      {
        companyId: "co-1",
        actorUserId: "user-1",
        isSuperAdmin: true,
        hasPermission: () => true,
      },
      {
        serviceId: "svc-1",
        exceptionDate: "2026-08-05",
        scope: "full_day",
        comment: "نعتذر عن عدم قدرتنا على استقبالكم اليوم لظروف طارئة.",
        idempotencyKey: "queued-1",
      },
    );

    assert.equal(result.cancelledAppointmentsCount, 1);
    assert.equal(result.notificationQueuedCount, 1);
    assert.equal(result.notificationSentCount, 0);
    assert.equal(result.messageKey, "notifications_queued");
    assert.equal(mock.getItems()[0]?.notification_status, "queued");
    assert.equal(mock.getItems()[0]?.notification_queue_id, "q-abc");
    assert.equal(mock.getItems()[0]?.provider_message_id, null);
    assert.equal(mock.getLastCancelInput()?.customerMessage, "نعتذر عن عدم قدرتنا على استقبالكم اليوم لظروف طارئة.");
    assert.equal(mock.getLastCancelInput()?.reason, "clinic_closed");
    assert.equal(typeof mock.getLastCancelInput()?.businessExceptionId, "string");
    assert.equal(typeof mock.getLastCancelInput()?.businessExceptionItemId, "string");
  });

  it("keeps cancellation when WhatsApp enqueue fails", async () => {
    const mock = createMockClient({
      bookings: [
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
      ],
    });
    mock.setPublishOutcome({
      ok: false,
      whatsappQueueIds: [],
      whatsappSkipped: false,
      error: "provider_down",
    });
    const service = new BusinessAppointmentExceptionService(
      mock.client,
      mock.bookingDomain as never,
      mock.notesFactory,
    );
    const result = await service.execute(
      {
        companyId: "co-1",
        actorUserId: "user-1",
        isSuperAdmin: true,
        hasPermission: () => true,
      },
      {
        serviceId: "svc-1",
        exceptionDate: "2026-08-05",
        scope: "full_day",
        comment: "Closed",
        idempotencyKey: "fail-notify-1",
      },
    );
    assert.equal(result.cancelledAppointmentsCount, 1);
    assert.equal(result.notificationFailedCount, 1);
    assert.equal(result.notificationSentCount, 0);
    assert.equal(mock.getItems()[0]?.cancellation_status, "cancelled");
    assert.equal(mock.getItems()[0]?.notification_status, "failed");
  });

  it("skips WhatsApp when customer has no phone", async () => {
    const mock = createMockClient({
      customerPhone: "",
      bookings: [
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
      ],
    });
    const service = new BusinessAppointmentExceptionService(
      mock.client,
      mock.bookingDomain as never,
      mock.notesFactory,
    );
    const result = await service.execute(
      {
        companyId: "co-1",
        actorUserId: "user-1",
        isSuperAdmin: true,
        hasPermission: () => true,
      },
      {
        serviceId: "svc-1",
        exceptionDate: "2026-08-05",
        scope: "full_day",
        comment: "Closed",
        idempotencyKey: "skip-phone",
      },
    );
    assert.equal(result.cancelledAppointmentsCount, 1);
    assert.equal(result.notificationSkippedCount, 1);
    assert.equal(result.notificationSentCount, 0);
    assert.equal(result.notificationQueuedCount, 0);
  });

  it("does not claim the same booking twice under concurrent exceptions", async () => {
    const mock = createMockClient({
      uniqueClaimFailBookingIds: ["b1"],
      bookings: [
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
      ],
    });
    const service = new BusinessAppointmentExceptionService(
      mock.client,
      mock.bookingDomain as never,
      mock.notesFactory,
    );
    const result = await service.execute(
      {
        companyId: "co-1",
        actorUserId: "user-1",
        isSuperAdmin: true,
        hasPermission: () => true,
      },
      {
        serviceId: "svc-1",
        exceptionDate: "2026-08-05",
        scope: "full_day",
        comment: "Closed",
        idempotencyKey: "concurrent-1",
      },
    );
    assert.equal(mock.getCancelCalls(), 0);
    assert.equal(result.cancelledAppointmentsCount, 0);
    assert.equal(mock.getItems().some((i) => i.cancellation_status === "skipped"), true);
  });
});

describe("BookingCancelled customerMessage", () => {
  it("prefers customerMessage over internal reason for templates", () => {
    const event = createBookingCancelledEvent(
      {
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
      } as never,
      "clinic_closed",
      "نعتذر عن عدم قدرتنا على استقبالكم اليوم لظروف طارئة.",
      "item-1",
    );
    assert.equal(event.payload.reason, "clinic_closed");
    assert.equal(
      event.payload.customerMessage,
      "نعتذر عن عدم قدرتنا على استقبالكم اليوم لظروف طارئة.",
    );
    assert.equal(event.payload.businessExceptionItemId, "item-1");
  });

  it("leaves customerMessage null for normal cancellations without it", () => {
    const event = createBookingCancelledEvent(
      {
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
      } as never,
      "customer_request",
      null,
    );
    assert.equal(event.payload.reason, "customer_request");
    assert.equal(event.payload.customerMessage, null);
  });
});

describe("reconcileBusinessExceptionNotification", () => {
  it("marks queued item sent and stores provider message id", async () => {
    const items = [
      {
        id: "item-1",
        exception_id: "exc-1",
        company_id: "co-1",
        notification_status: "queued",
        notification_queue_id: "q-1",
        provider_message_id: null,
      },
    ];
    let parentPatch: Record<string, unknown> | null = null;
    const client = {
      from: (table: string) => {
        if (table === "business_appointment_exception_items") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: items[0], error: null }),
                }),
              }),
            }),
            update: (patch: Record<string, unknown>) => ({
              eq: () => ({
                eq: async () => {
                  Object.assign(items[0], patch);
                  return { error: null };
                },
              }),
            }),
          };
        }
        if (table === "business_appointment_exceptions") {
          return {
            update: (patch: Record<string, unknown>) => ({
              eq: () => ({
                eq: async () => {
                  parentPatch = patch;
                  return { error: null };
                },
              }),
            }),
          };
        }
        throw new Error(table);
      },
    };

    // recount loads items again — simplify by making select return array thenable
    const recountClient = {
      from: (table: string) => {
        if (table === "business_appointment_exception_items") {
          const chain: Record<string, unknown> = {};
          chain.select = () => chain;
          chain.eq = () => chain;
          chain.maybeSingle = async () => ({ data: items[0], error: null });
          chain.update = (patch: Record<string, unknown>) => ({
            eq: () => ({
              eq: async () => {
                Object.assign(items[0], patch);
                return { error: null };
              },
            }),
          });
          chain.then = (resolve: (v: unknown) => unknown) =>
            resolve({
              data: [
                {
                  notification_status: items[0].notification_status,
                  cancellation_status: "cancelled",
                },
              ],
              error: null,
            });
          return chain;
        }
        if (table === "business_appointment_exceptions") {
          return {
            update: (patch: Record<string, unknown>) => ({
              eq: () => ({
                eq: async () => {
                  parentPatch = patch;
                  return { error: null };
                },
              }),
            }),
          };
        }
        throw new Error(table);
      },
    };

    await reconcileBusinessExceptionNotification(recountClient as never, {
      companyId: "co-1",
      queueId: "q-1",
      status: "sent",
      providerMessageId: "wamid.ABC123",
      businessExceptionItemId: "item-1",
    });

    assert.equal(items[0].notification_status, "sent");
    assert.equal(items[0].provider_message_id, "wamid.ABC123");
    assert.equal(parentPatch?.notification_sent_count, 1);
    assert.equal(parentPatch?.notification_queued_count, 0);
  });

  it("marks queued item failed without inventing provider id", async () => {
    const items = [
      {
        id: "item-1",
        exception_id: "exc-1",
        company_id: "co-1",
        notification_status: "queued",
        notification_queue_id: "q-1",
        provider_message_id: null,
      },
    ];
    const client = {
      from: (table: string) => {
        if (table === "business_appointment_exception_items") {
          const chain: Record<string, unknown> = {};
          chain.select = () => chain;
          chain.eq = () => chain;
          chain.maybeSingle = async () => ({ data: items[0], error: null });
          chain.update = (patch: Record<string, unknown>) => ({
            eq: () => ({
              eq: async () => {
                Object.assign(items[0], patch);
                return { error: null };
              },
            }),
          });
          chain.then = (resolve: (v: unknown) => unknown) =>
            resolve({
              data: [
                {
                  notification_status: items[0].notification_status,
                  cancellation_status: "cancelled",
                },
              ],
              error: null,
            });
          return chain;
        }
        if (table === "business_appointment_exceptions") {
          return {
            update: () => ({
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            }),
          };
        }
        throw new Error(table);
      },
    };

    await reconcileBusinessExceptionNotification(client as never, {
      companyId: "co-1",
      queueId: "q-1",
      status: "failed",
      errorMessage: "meta_rejected",
      businessExceptionItemId: "item-1",
    });

    assert.equal(items[0].notification_status, "failed");
    assert.equal(items[0].provider_message_id, null);
  });
});
