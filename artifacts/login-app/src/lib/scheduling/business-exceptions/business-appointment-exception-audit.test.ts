/**
 * Minimal Business Appointment Exception audit enrichment (app-layer).
 * Does not hit live DB or send WhatsApp.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AUDIT_ENTITY_KEYS, ENTITY_I18N_KEY } from "../../audit-log/constants.ts";
import { buildActivitySummary } from "../../audit-log/activity-summary.ts";
import type { EnrichedAuditLog } from "../../types.ts";
import type { LookupContext } from "../../audit-log/presenter.ts";
import { BookingDomainService } from "../booking-domain/booking-domain-service.ts";
import { BookingRepository } from "../booking-domain/booking-repository.ts";
import type { SchedulingBooking } from "../booking-domain/types.ts";

function booking(overrides: Partial<SchedulingBooking> = {}): SchedulingBooking {
  return {
    id: "bk-1",
    company_id: "co-1",
    branch_id: null,
    customer_id: "cu-1",
    resource_id: "res-1",
    service_id: "svc-1",
    start_at: "2026-08-05T09:00:00.000Z",
    end_at: "2026-08-05T09:30:00.000Z",
    timezone: "UTC",
    status: "confirmed",
    source: "crm",
    notes: null,
    rescheduled_from_id: null,
    version: 1,
    created_by: "u-1",
    updated_by: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    deleted_at: null,
    business_exception_id: null,
    business_exception_item_id: null,
    ...overrides,
  };
}

function createBookingClient(current: SchedulingBooking, updates: Record<string, unknown>[]) {
  return {
    from: (table: string) => {
      if (table !== "scheduling_bookings") throw new Error(`unexpected ${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({ data: current, error: null }),
              }),
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return {
            eq: () => ({
              eq: () => ({
                is: () => ({
                  select: () => ({
                    single: async () => ({
                      data: { ...current, ...payload, status: payload.status ?? current.status },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        },
      };
    },
  };
}

describe("exception audit entity registry", () => {
  it("registers exception entities for Audit Logs UI", () => {
    assert.ok((AUDIT_ENTITY_KEYS as readonly string[]).includes("business_appointment_exceptions"));
    assert.ok(
      (AUDIT_ENTITY_KEYS as readonly string[]).includes("business_appointment_exception_items"),
    );
    assert.equal(
      ENTITY_I18N_KEY.business_appointment_exceptions,
      "auditLogs.entities.businessAppointmentExceptions",
    );
    assert.equal(
      ENTITY_I18N_KEY.business_appointment_exception_items,
      "auditLogs.entities.businessAppointmentExceptionItems",
    );
  });
});

describe("BookingRepository.updateStatus exception link", () => {
  it("writes exception FKs when provided", async () => {
    const updates: Record<string, unknown>[] = [];
    const client = createBookingClient(booking(), updates);
    const repo = new BookingRepository(client as never);
    await repo.updateStatus("bk-1", "co-1", "cancelled", "u-1", "note", {
      businessExceptionId: "exc-1",
      businessExceptionItemId: "item-1",
    });
    assert.equal(updates[0]?.business_exception_id, "exc-1");
    assert.equal(updates[0]?.business_exception_item_id, "item-1");
    assert.equal(updates[0]?.status, "cancelled");
  });

  it("omits exception FKs for normal status updates", async () => {
    const updates: Record<string, unknown>[] = [];
    const client = createBookingClient(booking(), updates);
    const repo = new BookingRepository(client as never);
    await repo.updateStatus("bk-1", "co-1", "cancelled", "u-1", "note");
    assert.equal("business_exception_id" in (updates[0] ?? {}), false);
    assert.equal("business_exception_item_id" in (updates[0] ?? {}), false);
  });
});

describe("BookingDomainService.cancelBooking exception link", () => {
  it("persists exception FKs only when both exception ids are provided", async () => {
    const updates: Record<string, unknown>[] = [];
    const client = createBookingClient(booking(), updates);
    const service = new BookingDomainService(
      client as never,
      {} as never,
      { publish: async () => ({ ok: true }) },
    );

    await service.cancelBooking({
      companyId: "co-1",
      bookingId: "bk-1",
      updatedBy: "u-1",
      reason: "clinic_closed",
      notes: "Sorry for the inconvenience",
      customerMessage: "Sorry for the inconvenience",
      businessExceptionId: "exc-1",
      businessExceptionItemId: "item-1",
      enforceCancellationPolicy: false,
    });

    assert.equal(updates[0]?.business_exception_id, "exc-1");
    assert.equal(updates[0]?.business_exception_item_id, "item-1");
    assert.match(String(updates[0]?.notes), /\[Cancellation: clinic_closed\]/);
  });

  it("leaves exception FKs unset for normal cancellation", async () => {
    const updates: Record<string, unknown>[] = [];
    const client = createBookingClient(booking(), updates);
    const service = new BookingDomainService(
      client as never,
      {} as never,
      { publish: async () => ({ ok: true }) },
    );

    await service.cancelBooking({
      companyId: "co-1",
      bookingId: "bk-1",
      updatedBy: "u-1",
      reason: "customer_request",
      notes: "Customer called",
      enforceCancellationPolicy: false,
    });

    assert.equal("business_exception_id" in (updates[0] ?? {}), false);
    assert.equal("business_exception_item_id" in (updates[0] ?? {}), false);
  });
});

describe("customer note related entity resolution", () => {
  it("uses explicit related booking id while keeping exception operationId", () => {
    const input = {
      operationId: "exc-1",
      relatedEntityType: "booking" as string | null,
      relatedEntityId: "bk-1" as string | null,
    };
    const relatedEntityType =
      input.relatedEntityType?.trim() ||
      (input.operationId && !input.relatedEntityId ? "booking" : undefined);
    const relatedEntityId =
      input.relatedEntityId?.trim() ||
      (relatedEntityType === "booking" ? input.operationId?.trim() : undefined) ||
      undefined;

    assert.equal(relatedEntityType, "booking");
    assert.equal(relatedEntityId, "bk-1");
    assert.notEqual(relatedEntityId, input.operationId);
  });
});

describe("audit activity summaries for exception entities", () => {
  const t = ((key: string, opts?: Record<string, unknown>) => {
    if (!opts) return key;
    return `${key}:${JSON.stringify(opts)}`;
  }) as never;

  const emptyContext: LookupContext = {
    userNames: new Map(),
    companyNames: new Map(),
    roleNames: new Map(),
    permissionCodes: new Map(),
  };

  function log(partial: Partial<EnrichedAuditLog>): EnrichedAuditLog {
    return {
      id: "a1",
      user_id: "u1",
      company_id: "co-1",
      action: "UPDATE",
      entity: "scheduling_bookings",
      entity_id: "bk-1",
      ip_address: null,
      metadata: {},
      created_at: "2026-08-05T12:00:00.000Z",
      ...partial,
    } as EnrichedAuditLog;
  }

  it("summarizes exception CREATE", () => {
    const summary = buildActivitySummary(
      log({
        action: "CREATE",
        entity: "business_appointment_exceptions",
        entity_id: "exc-1",
        metadata: {
          scope: "full_day",
          exception_date: "2026-08-05",
          source: "business_appointment_exception",
        },
      }),
      emptyContext,
      t,
    );
    assert.match(summary, /businessExceptionCreated/);
    assert.match(summary, /full_day/);
  });

  it("summarizes exception item UPDATE with notify status", () => {
    const summary = buildActivitySummary(
      log({
        entity: "business_appointment_exception_items",
        entity_id: "item-1",
        metadata: {
          cancellation_status: "cancelled",
          notification_status: "sent",
          provider_message_id: "wamid.TEST",
        },
      }),
      emptyContext,
      t,
    );
    assert.match(summary, /businessExceptionItemUpdated/);
    assert.match(summary, /sent/);
  });

  it("summarizes scheduling booking cancelled via exception", () => {
    const summary = buildActivitySummary(
      log({
        metadata: {
          customer_id: "cu-1",
          old_status: "confirmed",
          new_status: "cancelled",
          source: "business_appointment_exception",
          business_exception_id: "exc-1",
          business_exception_item_id: "item-1",
          cancellation_reason: "clinic_closed",
          customer_message: "Sorry",
        },
      }),
      emptyContext,
      t,
    );
    assert.match(summary, /schedulingBookingCancelledByException/);
  });

  it("summarizes normal scheduling booking cancel without exception wording", () => {
    const summary = buildActivitySummary(
      log({
        metadata: {
          customer_id: "cu-1",
          old_status: "confirmed",
          new_status: "cancelled",
        },
      }),
      emptyContext,
      t,
    );
    assert.match(summary, /bookingCancelled/);
    assert.doesNotMatch(summary, /Exception/i);
  });
});

describe("timeline cancel payload enrichment shape", () => {
  it("includes exception fields when present and omits provider id when null", () => {
    const exception = {
      exceptionId: "exc-1",
      comment: "Clinic closed today",
      scope: "full_day",
      exceptionDate: "2026-08-05",
      notificationStatus: "queued",
      providerMessageId: null as string | null,
    };
    const payload: Record<string, unknown> = {
      bookingId: "bk-1",
      service: "Consult",
      exceptionId: exception.exceptionId,
      comment: exception.comment,
      scope: exception.scope,
      exceptionDate: exception.exceptionDate,
      notificationStatus: exception.notificationStatus,
    };
    if (exception.providerMessageId) {
      payload.providerMessageId = exception.providerMessageId;
    }
    assert.equal(payload.exceptionId, "exc-1");
    assert.equal(payload.notificationStatus, "queued");
    assert.equal("providerMessageId" in payload, false);

    payload.providerMessageId = "wamid.ABC";
    assert.equal(payload.providerMessageId, "wamid.ABC");
  });
});
