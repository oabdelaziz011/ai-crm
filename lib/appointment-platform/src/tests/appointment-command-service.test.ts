import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppointmentCommandService } from "../services/appointment-command-service.js";
import type { AppointmentRepository } from "../repositories/appointment-repository-port.js";
import type { AppointmentRecord } from "../types/appointment-types.js";
import type { SchedulingEnginePort } from "../ports/scheduling-engine-port.js";

function createMemoryRepo(): AppointmentRepository {
  const store = new Map<string, AppointmentRecord>();

  const base = (): AppointmentRecord => ({
    id: "appt-1",
    companyId: "company-1",
    branchId: null,
    customerId: "cust-1",
    leadId: null,
    conversationId: null,
    resourceId: "res-1",
    serviceId: "svc-1",
    startAt: "2026-08-02T10:00:00.000Z",
    endAt: "2026-08-02T11:00:00.000Z",
    timezone: "UTC",
    status: "pending",
    source: "crm",
    notes: null,
    rescheduledFromId: null,
    version: 1,
    createdBy: "user-1",
    updatedBy: "user-1",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  });

  return {
    mapRow: () => base(),
    getAppointment: async (_c, id) => store.get(id) ?? base(),
    searchAppointments: async () => ({ appointments: [], total: 0 }),
    linkIdentity: async (input) => {
      const existing = store.get(input.appointmentId) ?? base();
      const updated = {
        ...existing,
        leadId: input.leadId ?? existing.leadId,
        conversationId: input.conversationId ?? existing.conversationId,
      };
      store.set(input.appointmentId, updated);
      return updated;
    },
    updateFields: async (input) => {
      const existing = store.get(input.appointmentId) ?? base();
      const updated = { ...existing, notes: input.notes ?? existing.notes, updatedBy: input.updatedBy ?? existing.updatedBy };
      store.set(input.appointmentId, updated);
      return updated;
    },
    confirmAppointment: async (companyId, appointmentId, updatedBy) => {
      const existing = store.get(appointmentId) ?? base();
      const updated = { ...existing, status: "confirmed" as const, updatedBy: updatedBy ?? existing.updatedBy };
      store.set(appointmentId, updated);
      return updated;
    },
    fetchMetrics: async () => ({
      upcoming: 1,
      completedInPeriod: 0,
      cancelledInPeriod: 0,
      noShowInPeriod: 0,
      createdInPeriod: 1,
      createdPreviousPeriod: 0,
      averageDurationMinutes: 60,
      resourceUtilizationPercent: 25,
    }),
  };
}

function createMemoryEngine(): SchedulingEnginePort {
  return {
    createBooking: async (input) => ({
      booking: {
        id: "appt-1",
        company_id: input.companyId,
        customer_id: input.customerId,
        resource_id: input.resourceId,
        service_id: input.serviceId,
        start_at: `${input.date}T${input.slotStart}:00.000Z`,
        end_at: `${input.date}T${input.slotStart}:00.000Z`,
        timezone: "UTC",
        status: "pending",
        source: input.source,
        notes: input.notes,
        branch_id: input.branchId,
        rescheduled_from_id: null,
        version: 1,
        created_by: input.createdBy,
        updated_by: input.createdBy,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        lead_id: null,
        conversation_id: null,
      },
    }),
    cancelBooking: async () => ({ booking: { id: "appt-1", status: "cancelled" } as never }),
    rescheduleBooking: async () => ({ booking: { id: "appt-1", status: "pending" } as never }),
    checkInBooking: async () => ({ booking: { id: "appt-1", status: "checked_in" } as never }),
    completeBooking: async () => ({ booking: { id: "appt-1", status: "completed" } as never }),
    markNoShowBooking: async () => ({ booking: { id: "appt-1", status: "no_show" } as never }),
    validateBooking: async () => ({ valid: true, codes: [] }),
  };
}

describe("AppointmentCommandService", () => {
  const ctx = {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: () => true,
  };

  it("creates an appointment via scheduling engine", async () => {
    const service = new AppointmentCommandService({
      appointments: createMemoryRepo(),
      engine: createMemoryEngine(),
      identity: { resolveCustomerId: async () => "cust-1" },
      events: { publish: async () => {} },
      audit: { write: async () => {} },
    });

    const result = await service.createAppointment(ctx, {
      companyId: "company-1",
      customerId: "cust-1",
      resourceId: "res-1",
      serviceId: "svc-1",
      date: "2026-08-02",
      slotStart: "10:00",
    });

    assert.equal(result.appointment.id, "appt-1");
  });

  it("links lead and conversation after create", async () => {
    const repo = createMemoryRepo();
    const service = new AppointmentCommandService({
      appointments: repo,
      engine: createMemoryEngine(),
      identity: { resolveCustomerId: async () => "cust-1" },
      events: { publish: async () => {} },
      audit: { write: async () => {} },
    });

    await service.createAppointment(ctx, {
      companyId: "company-1",
      customerId: "cust-1",
      leadId: "lead-1",
      conversationId: "conv-1",
      resourceId: "res-1",
      serviceId: "svc-1",
      date: "2026-08-02",
      slotStart: "10:00",
    });

    const linked = await repo.getAppointment("company-1", "appt-1");
    assert.equal(linked?.leadId, "lead-1");
    assert.equal(linked?.conversationId, "conv-1");
  });
});
