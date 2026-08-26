/**
 * Phase 3B — webhook scheduling search / reschedule / cancel + customer ownership.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  executeCancelBooking,
  executeCheckInBooking,
  executeCheckOutBooking,
  executeRescheduleBooking,
  executeSearchBookings,
} from "./adapters/scheduling-tool-ports.js";
import type { BookingDomainServicePort } from "./tools/scheduling-agent-ports.js";
import {
  createCancelBookingTool,
  createCheckInBookingTool,
  createRescheduleBookingTool,
  createSearchBookingsTool,
} from "./tools/scheduling-agent-tools.js";
import type { SchedulingToolPorts } from "./tools/scheduling-agent-ports.js";

type Row = Record<string, unknown>;

function createMemoryClient(seed: {
  bookings: Row[];
  customers?: Row[];
  conversations?: Row[];
  companyId?: string;
}) {
  const bookings = [...seed.bookings];
  const companyId = seed.companyId ?? "company-a";
  const conversations = [...(seed.conversations ?? [])];
  const customers =
    seed.customers ??
    [...new Set(bookings.map((b) => String(b.customer_id)))].map((id) => ({
      id,
      company_id: companyId,
      name: id === "customer-a" ? "Ada" : "Other",
      phone: id === "customer-a" ? "201000000001" : "201000000002",
    }));

  function applyFilters(rows: Row[], filters: Array<{ col: string; op: string; val: unknown }>) {
    return rows.filter((row) =>
      filters.every((f) => {
        if (f.op === "eq") return row[f.col] === f.val;
        if (f.op === "gte") return String(row[f.col] ?? "") >= String(f.val);
        if (f.op === "is" && f.val === null) return row[f.col] == null;
        if (f.op === "in" && Array.isArray(f.val)) return f.val.includes(row[f.col]);
        if (f.op === "not" && Array.isArray(f.val) && f.val[0] === "eq") {
          return row[f.col] !== f.val[1];
        }
        return true;
      }),
    );
  }

  function tableRows(table: string): Row[] {
    if (table === "scheduling_bookings") return bookings;
    if (table === "customers") return customers;
    if (table === "conversations") return conversations;
    if (table === "scheduling_resources") {
      return [{ id: "resource-1", company_id: companyId, name: "Dr A" }];
    }
    if (table === "scheduling_services") {
      return [{ id: "service-1", company_id: companyId, name: "Clinic" }];
    }
    return [];
  }

  const client = {
    from(table: string) {
      const filters: Array<{ col: string; op: string; val: unknown }> = [];
      let limitN = 100;
      let ascending = false;
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = () => chain();
      builder.eq = (col: string, val: unknown) => {
        filters.push({ col, op: "eq", val });
        return chain();
      };
      builder.gte = (col: string, val: unknown) => {
        filters.push({ col, op: "gte", val });
        return chain();
      };
      builder.is = (col: string, val: unknown) => {
        filters.push({ col, op: "is", val });
        return chain();
      };
      builder.in = (col: string, val: unknown[]) => {
        filters.push({ col, op: "in", val });
        return chain();
      };
      builder.not = (col: string, op: string, val: unknown) => {
        filters.push({ col, op: "not", val: [op, val] });
        return chain();
      };
      builder.order = (_col: string, opts?: { ascending?: boolean }) => {
        ascending = opts?.ascending === true;
        return chain();
      };
      builder.limit = (n: number) => {
        limitN = n;
        return chain();
      };
      builder.update = (patch: Record<string, unknown>) => {
        builder._updatePatch = patch;
        return chain();
      };
      builder.maybeSingle = async () => {
        const rows = applyFilters(tableRows(table), filters);
        return { data: rows[0] ?? null, error: null };
      };
      const run = async () => {
        const patch = builder._updatePatch as Record<string, unknown> | undefined;
        if (patch && (table === "scheduling_bookings" || table === "conversations")) {
          const rows = applyFilters(tableRows(table), filters);
          for (const row of rows) {
            Object.assign(row, patch);
          }
          return { data: rows, error: null };
        }
        let rows = applyFilters(tableRows(table), filters);
        if (table === "scheduling_bookings") {
          rows = [...rows].sort((a, b) => {
            const av = String(a.start_at ?? "");
            const bv = String(b.start_at ?? "");
            return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
          });
        }
        return { data: rows.slice(0, limitN), error: null };
      };
      (builder as { then: typeof Promise.prototype.then }).then = (
        onfulfilled: (v: unknown) => unknown,
        onrejected?: (e: unknown) => unknown,
      ) => run().then(onfulfilled, onrejected);
      return builder;
    },
  };

  return { client: client as unknown as SupabaseClient, bookings, conversations, companyId };
}

function baseBooking(overrides: Partial<Row> = {}): Row {
  return {
    id: "booking-1",
    company_id: "company-a",
    customer_id: "customer-a",
    status: "confirmed",
    start_at: "2026-08-15T09:00:00.000Z",
    confirmation_number: "BK-000015",
    resource_id: "resource-1",
    service_id: "service-1",
    deleted_at: null,
    customers: { name: "Ada" },
    scheduling_resources: { name: "Dr A" },
    scheduling_services: { name: "Clinic" },
    ...overrides,
  };
}

describe("Phase 3B scheduling mutation ports", () => {
  it("A/B/D. search_bookings is customer-scoped with historical daysBack", async () => {
    const { client } = createMemoryClient({
      bookings: [
        baseBooking({ id: "b-old", start_at: "2026-07-01T09:00:00.000Z" }),
        baseBooking({ id: "b-mid", start_at: "2026-08-10T09:00:00.000Z" }),
        baseBooking({
          id: "b-other",
          customer_id: "customer-b",
          start_at: "2026-08-12T09:00:00.000Z",
          confirmation_number: "BK-000099",
        }),
      ],
    });

    const result = await executeSearchBookings(client, {
      companyId: "company-a",
      userId: "user-1",
      trustedCustomerId: "customer-a",
      daysBack: 30,
    });

    assert.equal(result.success, true);
    const ids = result.bookings.map((b) => b.bookingId).sort();
    assert.deepEqual(ids, ["b-mid"]);
    assert.equal(result.bookings.some((b) => b.customerId === "customer-b"), false);
  });

  it("C. search_bookings returns no cross-company rows", async () => {
    const { client } = createMemoryClient({
      bookings: [
        baseBooking({ id: "b-a", company_id: "company-a" }),
        baseBooking({ id: "b-x", company_id: "company-b", confirmation_number: "BK-000002" }),
      ],
    });
    const result = await executeSearchBookings(client, {
      companyId: "company-a",
      userId: "user-1",
      trustedCustomerId: "customer-a",
      daysBack: 90,
    });
    assert.equal(result.bookings.every((b) => b.bookingId !== "b-x"), true);
    assert.equal(result.bookings.some((b) => b.bookingId === "b-a"), true);
  });

  it("search_bookings fails closed without trusted customer", async () => {
    const { client } = createMemoryClient({ bookings: [baseBooking()] });
    const result = await executeSearchBookings(client, {
      companyId: "company-a",
      userId: "user-1",
      trustedCustomerId: null,
      daysBack: 30,
    });
    assert.equal(result.success, false);
    assert.deepEqual(result.errors, ["CUSTOMER_CONTEXT_REQUIRED"]);
    assert.equal(result.bookings.length, 0);
  });

  it("search_bookings prefers trustedCustomerId over a different phone lookup", async () => {
    const { client } = createMemoryClient({
      bookings: [
        baseBooking({
          id: "b-patient",
          customer_id: "customer-patient",
          start_at: "2026-08-12T09:00:00.000Z",
          confirmation_number: "BK-000055",
        }),
        baseBooking({
          id: "b-trusted",
          customer_id: "customer-a",
          start_at: "2026-08-13T09:00:00.000Z",
          confirmation_number: "BK-000056",
        }),
      ],
      customers: [
        { id: "customer-a", company_id: "company-a", name: "Ada", phone: "201000000001" },
        { id: "customer-patient", company_id: "company-a", name: "Mona", phone: "201021232123" },
      ],
    });

    const result = await executeSearchBookings(client, {
      companyId: "company-a",
      userId: "user-1",
      trustedCustomerId: "customer-a",
      phone: "01021232123",
      daysBack: 90,
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.bookings.map((b) => b.bookingId), ["b-trusted"]);
  });

  it("search_bookings by phone returns that patient's bookings when no trusted customer", async () => {
    const { client } = createMemoryClient({
      bookings: [
        baseBooking({
          id: "b-patient",
          customer_id: "customer-patient",
          start_at: "2026-08-12T09:00:00.000Z",
          confirmation_number: "BK-000055",
        }),
        baseBooking({
          id: "b-other",
          customer_id: "customer-a",
          start_at: "2026-08-13T09:00:00.000Z",
        }),
      ],
      customers: [
        { id: "customer-a", company_id: "company-a", name: "Ada", phone: "201000000001" },
        { id: "customer-patient", company_id: "company-a", name: "Mona", phone: "201021232123" },
      ],
    });

    const result = await executeSearchBookings(client, {
      companyId: "company-a",
      userId: "user-1",
      trustedCustomerId: null,
      phone: "01021232123",
      daysBack: 90,
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.bookings.map((b) => b.bookingId), ["b-patient"]);
  });

  it("search_bookings with trusted customer finds future booking for cancel even when WhatsApp phone differs", async () => {
    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { client } = createMemoryClient({
      bookings: [
        baseBooking({
          id: "b-future",
          customer_id: "customer-trusted",
          start_at: futureStart,
          confirmation_number: "BK-000200",
          status: "confirmed",
        }),
      ],
      customers: [
        {
          id: "customer-trusted",
          company_id: "company-a",
          name: "Trusted",
          phone: "01013363637",
        },
      ],
    });

    const result = await executeSearchBookings(client, {
      companyId: "company-a",
      userId: "user-1",
      trustedCustomerId: "customer-trusted",
      phone: "201011404109",
      daysBack: 90,
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.bookings.map((b) => b.bookingId), ["b-future"]);
  });

  it("search_bookings collapses digit-equivalent phone duplicates and binds conversation", async () => {
    const { client, conversations } = createMemoryClient({
      bookings: [
        baseBooking({
          id: "b-canonical",
          customer_id: "customer-canonical",
          start_at: "2026-08-20T09:00:00.000Z",
          confirmation_number: "BK-000100",
        }),
        baseBooking({
          id: "b-dup",
          customer_id: "customer-dup",
          start_at: "2026-08-19T09:00:00.000Z",
          confirmation_number: "BK-000101",
        }),
        baseBooking({
          id: "b-canonical-2",
          customer_id: "customer-canonical",
          start_at: "2026-08-18T09:00:00.000Z",
          confirmation_number: "BK-000102",
        }),
      ],
      customers: [
        { id: "customer-dup", company_id: "company-a", name: "Dup", phone: "01023169075" },
        { id: "customer-canonical", company_id: "company-a", name: "Canonical", phone: "201023169075" },
      ],
      conversations: [{ id: "conv-1", company_id: "company-a", customer_id: null }],
    });

    const result = await executeSearchBookings(client, {
      companyId: "company-a",
      userId: "user-1",
      trustedCustomerId: null,
      phone: "01023169075",
      daysBack: 90,
      conversationId: "conv-1",
    });

    assert.equal(result.success, true);
    assert.deepEqual(
      result.bookings.map((b) => b.bookingId).sort(),
      ["b-canonical", "b-canonical-2"],
    );
    assert.equal(result.bookings.some((b) => b.bookingId === "b-dup"), false);
    assert.equal(conversations[0]?.customer_id, "customer-canonical");
  });

  it("E/F/G. reschedule succeeds for owner; denies wrong company/customer", async () => {
    const { client } = createMemoryClient({ bookings: [baseBooking()] });
    let rescheduleCalls = 0;
    const domain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async rescheduleBooking() {
        rescheduleCalls += 1;
        return {
          previousBooking: { id: "booking-1", status: "rescheduled" },
          booking: {
            id: "booking-2",
            status: "confirmed",
            start_at: "2026-08-20T10:00:00.000Z",
            end_at: "2026-08-20T10:30:00.000Z",
            company_id: "company-a",
            customer_id: "customer-a",
          },
        };
      },
    };

    const ok = await executeRescheduleBooking(client, domain, {
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-1",
      date: "2026-08-20",
      slotStart: "10:00",
      trustedCustomerId: "customer-a",
    });
    assert.equal(ok.success, true);
    assert.equal(rescheduleCalls, 1);

    const wrongCustomer = await executeRescheduleBooking(client, domain, {
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-1",
      date: "2026-08-20",
      slotStart: "10:00",
      trustedCustomerId: "customer-other",
    });
    assert.equal(wrongCustomer.success, false);
    assert.deepEqual(wrongCustomer.errors, ["CUSTOMER_OWNERSHIP_DENIED"]);
    assert.equal(rescheduleCalls, 1);

    const byReferenceAndPhone = await executeRescheduleBooking(client, domain, {
      companyId: "company-a",
      userId: "user-1",
      bookingReference: "BK-000015",
      date: "2026-08-21",
      slotStart: "11:00",
      trustedCustomerId: null,
      phone: "201000000001",
    });
    assert.equal(byReferenceAndPhone.success, true);
    assert.equal(byReferenceAndPhone.reference, "BK-000015");
    assert.equal(rescheduleCalls, 2);

    const wrongCompany = await executeRescheduleBooking(client, domain, {
      companyId: "company-b",
      userId: "user-1",
      bookingId: "booking-1",
      date: "2026-08-20",
      slotStart: "10:00",
      trustedCustomerId: "customer-a",
    });
    assert.equal(wrongCompany.success, false);
    assert.deepEqual(wrongCompany.errors, ["booking_not_found"]);
  });

  it("H/I. reschedule maps invalid status and booking_conflict from domain", async () => {
    const { client } = createMemoryClient({ bookings: [baseBooking()] });
    const invalidStatusDomain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async rescheduleBooking() {
        throw new Error("INVALID_STATUS_TRANSITION:cancelled->rescheduled");
      },
    };
    const statusDenied = await executeRescheduleBooking(client, invalidStatusDomain, {
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-1",
      date: "2026-08-20",
      slotStart: "10:00",
      trustedCustomerId: "customer-a",
    });
    assert.equal(statusDenied.success, false);
    assert.deepEqual(statusDenied.errors, ["invalid_status"]);

    const conflictDomain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async rescheduleBooking() {
        const err = new Error("booking_conflict") as Error & { name: string; codes: string[] };
        err.name = "BookingDomainError";
        err.codes = ["booking_conflict"];
        throw err;
      },
    };
    const conflict = await executeRescheduleBooking(client, conflictDomain, {
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-1",
      date: "2026-08-20",
      slotStart: "10:00",
      trustedCustomerId: "customer-a",
    });
    assert.equal(conflict.success, false);
    assert.ok(conflict.errors?.includes("booking_conflict"));
  });

  it("J/K/L/M/N. cancel succeeds; denies wrong company/customer/status/policy", async () => {
    const { client } = createMemoryClient({ bookings: [baseBooking()] });
    let cancelCalls = 0;
    const domain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async cancelBooking() {
        cancelCalls += 1;
        return {
          booking: {
            id: "booking-1",
            status: "cancelled",
            start_at: "2026-08-15T09:00:00.000Z",
            company_id: "company-a",
            customer_id: "customer-a",
            updated_at: "2026-08-20T12:00:00.000Z",
          },
        };
      },
    };

    const ok = await executeCancelBooking(client, domain, {
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-1",
      trustedCustomerId: "customer-a",
      reason: "customer_request",
    });
    assert.equal(ok.success, true);
    assert.equal(ok.status, "cancelled");
    assert.equal(cancelCalls, 1);

    const { client: clientCancelled } = createMemoryClient({
      bookings: [baseBooking({ status: "cancelled", confirmation_number: "BK-000001" })],
    });
    const alreadyCancelled = await executeCancelBooking(clientCancelled, domain, {
      companyId: "company-a",
      userId: "user-1",
      bookingReference: "BK-000001",
      trustedCustomerId: "customer-a",
    });
    assert.equal(alreadyCancelled.success, false);
    assert.deepEqual(alreadyCancelled.errors, ["already_cancelled"]);
    assert.match(String(alreadyCancelled.customerFacingMessage ?? ""), /ملغي بالفعل/);
    assert.equal(cancelCalls, 1);

    const wrongCustomer = await executeCancelBooking(client, domain, {
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-1",
      trustedCustomerId: "customer-b",
    });
    assert.deepEqual(wrongCustomer.errors, ["CUSTOMER_OWNERSHIP_DENIED"]);
    assert.equal(cancelCalls, 1);

    const wrongCompany = await executeCancelBooking(client, domain, {
      companyId: "company-b",
      userId: "user-1",
      bookingId: "booking-1",
      trustedCustomerId: "customer-a",
    });
    assert.deepEqual(wrongCompany.errors, ["booking_not_found"]);

    const statusDomain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async cancelBooking() {
        throw new Error("INVALID_STATUS_TRANSITION:completed->cancelled");
      },
    };
    const statusDenied = await executeCancelBooking(client, statusDomain, {
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-1",
      trustedCustomerId: "customer-a",
    });
    assert.deepEqual(statusDenied.errors, ["invalid_status"]);

    const policyDomain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async cancelBooking() {
        const err = new Error("cancellation_window_expired") as Error & { name: string; codes: string[] };
        err.name = "BookingDomainError";
        err.codes = ["cancellation_window_expired"];
        throw err;
      },
    };
    const policyDenied = await executeCancelBooking(client, policyDomain, {
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-1",
      trustedCustomerId: "customer-a",
    });
    assert.ok(policyDenied.errors?.includes("cancellation_window_expired"));
    assert.match(
      String(policyDenied.customerFacingMessage ?? ""),
      /موعد الإلغاء عدّى/,
    );
  });

  it("tools ignore LLM customerId and require trusted conversation customer", async () => {
    const ports = {
      async searchBookings(input) {
        return {
          success: true,
          bookings: [],
          total: 0,
          message: input.trustedCustomerId ?? "missing",
        };
      },
      async rescheduleBooking() {
        return { success: true, bookingId: "x" };
      },
      async cancelBooking() {
        return { success: true, bookingId: "x", status: "cancelled" };
      },
    } as unknown as SchedulingToolPorts;

    const search = createSearchBookingsTool(ports);
    const withoutTrusted = await search.execute(
      {
        companyId: "company-a",
        conversationId: "conv-1",
        conversationState: "waiting_user",
        userId: "user-1",
        trustedCustomerId: null,
      },
      { customerId: "llm-forged-customer", daysBack: 30 },
    );
    assert.equal((withoutTrusted as { message: string }).message, "missing");

    const cancel = createCancelBookingTool(ports);
    const denied = await cancel.execute(
      {
        companyId: "company-a",
        conversationId: "conv-1",
        conversationState: "waiting_user",
        userId: "user-1",
        trustedCustomerId: null,
      },
      { bookingId: "booking-1" },
    );
    assert.equal(denied.success, false);
    assert.deepEqual(denied.errors, ["CUSTOMER_CONTEXT_REQUIRED"]);

    const reschedule = createRescheduleBookingTool(ports);
    const deniedReschedule = await reschedule.execute(
      {
        companyId: "company-a",
        conversationId: "conv-1",
        conversationState: "waiting_user",
        userId: "user-1",
        trustedCustomerId: null,
      },
      { bookingId: "booking-1", date: "2026-08-21", slotStart: "11:00" },
    );
    assert.equal(deniedReschedule.success, false);
  });
});

describe("Phase 5H check_in / check_out ownership + domain", () => {
  const bookingA = {
    id: "booking-a",
    company_id: "company-a",
    customer_id: "customer-a",
    status: "confirmed",
    start_at: "2026-08-20T10:00:00.000Z",
    confirmation_number: "CNF-A",
    resource_id: "resource-1",
    service_id: "service-1",
    deleted_at: null,
  };

  it("check_in succeeds for trusted owner; reaches domain", async () => {
    let domainCalled = false;
    const { client } = createMemoryClient({ bookings: [{ ...bookingA }] });
    const domain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async checkInBooking(input) {
        domainCalled = true;
        assert.equal(input.companyId, "company-a");
        assert.equal(input.bookingId, "booking-a");
        return {
          booking: {
            id: "booking-a",
            status: "checked_in",
            start_at: bookingA.start_at,
            company_id: "company-a",
            customer_id: "customer-a",
            confirmation_number: "CNF-A",
            updated_at: "2026-08-20T10:05:00.000Z",
          },
        };
      },
    };

    const result = await executeCheckInBooking(client, domain, {
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-a",
      trustedCustomerId: "customer-a",
    });
    assert.equal(result.success, true);
    assert.equal(result.status, "checked_in");
    assert.equal(result.confirmationNumber, "CNF-A");
    assert.equal(domainCalled, true);
  });

  it("check_in returns authoritative confirmation_number (never UUID substring)", async () => {
    const booking = {
      ...bookingA,
      confirmation_number: "BK-000123",
    };
    const { client } = createMemoryClient({ bookings: [booking] });
    const domain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async checkInBooking() {
        return {
          booking: {
            id: booking.id,
            status: "checked_in",
            start_at: booking.start_at,
            company_id: "company-a",
            customer_id: "customer-a",
            confirmation_number: "BK-000123",
            updated_at: "2026-08-20T10:05:00.000Z",
          },
        };
      },
    };
    const result = await executeCheckInBooking(client, domain, {
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-a",
      trustedCustomerId: "customer-a",
    });
    assert.equal(result.confirmationNumber, "BK-000123");
    assert.notEqual(
      result.confirmationNumber,
      String(booking.id).replace(/-/g, "").slice(0, 8).toUpperCase(),
    );
  });

  it("check_out succeeds via completeBooking for in_progress booking", async () => {
    let domainCalled = false;
    const { client } = createMemoryClient({
      bookings: [{ ...bookingA, status: "in_progress" }],
    });
    const domain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async completeBooking(input) {
        domainCalled = true;
        assert.equal(input.bookingId, "booking-a");
        return {
          booking: {
            id: "booking-a",
            status: "completed",
            start_at: bookingA.start_at,
            company_id: "company-a",
            customer_id: "customer-a",
            confirmation_number: "CNF-A",
            updated_at: "2026-08-20T11:00:00.000Z",
          },
        };
      },
    };

    const result = await executeCheckOutBooking(client, domain, {
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-a",
      trustedCustomerId: "customer-a",
    });
    assert.equal(result.success, true);
    assert.equal(result.status, "completed");
    assert.equal(domainCalled, true);
  });

  it("missing trusted customer → CUSTOMER_CONTEXT_REQUIRED; domain not called", async () => {
    let domainCalled = false;
    const { client } = createMemoryClient({ bookings: [{ ...bookingA }] });
    const domain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async checkInBooking() {
        domainCalled = true;
        throw new Error("should not run");
      },
    };

    const result = await executeCheckInBooking(client, domain, {
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-a",
      trustedCustomerId: null,
    });
    assert.equal(result.success, false);
    assert.deepEqual(result.errors, ["CUSTOMER_CONTEXT_REQUIRED"]);
    assert.equal(domainCalled, false);
  });

  it("cross-customer → CUSTOMER_OWNERSHIP_DENIED; no mutation", async () => {
    let domainCalled = false;
    const { client } = createMemoryClient({ bookings: [{ ...bookingA }] });
    const domain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async checkInBooking() {
        domainCalled = true;
        throw new Error("should not run");
      },
    };

    const result = await executeCheckInBooking(client, domain, {
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-a",
      trustedCustomerId: "customer-b",
    });
    assert.equal(result.success, false);
    assert.deepEqual(result.errors, ["CUSTOMER_OWNERSHIP_DENIED"]);
    assert.equal(domainCalled, false);
  });

  it("cross-company booking not found", async () => {
    let domainCalled = false;
    const { client } = createMemoryClient({
      bookings: [{ ...bookingA, company_id: "company-b" }],
      companyId: "company-a",
    });
    const domain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async checkInBooking() {
        domainCalled = true;
        throw new Error("should not run");
      },
    };

    const result = await executeCheckInBooking(client, domain, {
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-a",
      trustedCustomerId: "customer-a",
    });
    assert.equal(result.success, false);
    assert.deepEqual(result.errors, ["booking_not_found"]);
    assert.equal(domainCalled, false);
  });

  it("invalid lifecycle / double check-in returns invalid_status", async () => {
    const { client } = createMemoryClient({
      bookings: [{ ...bookingA, status: "checked_in" }],
    });
    const domain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async checkInBooking() {
        throw new Error("INVALID_STATUS_TRANSITION:checked_in->checked_in");
      },
      async completeBooking() {
        throw new Error("INVALID_STATUS_TRANSITION:completed->completed");
      },
    };

    const checkIn = await executeCheckInBooking(client, domain, {
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-a",
      trustedCustomerId: "customer-a",
    });
    assert.equal(checkIn.success, false);
    assert.deepEqual(checkIn.errors, ["invalid_status"]);

    // Already completed (terminal) — check_out must fail without mutating again.
    const { client: completedClient } = createMemoryClient({
      bookings: [{ ...bookingA, status: "completed" }],
    });
    const checkOut = await executeCheckOutBooking(completedClient, domain, {
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-a",
      trustedCustomerId: "customer-a",
    });
    assert.equal(checkOut.success, false);
    assert.deepEqual(checkOut.errors, ["invalid_status"]);
  });

  it("Phase 5Q.1: check_out advances checked_in → completed via clinic intermediates", async () => {
    const { client } = createMemoryClient({
      bookings: [{ ...bookingA, status: "checked_in" }],
    });
    const statuses: string[] = [];
    const domain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async completeBooking(input) {
        statuses.push("complete");
        return {
          booking: {
            id: input.bookingId,
            status: "completed",
            updated_at: "2026-08-21T12:00:00.000Z",
          } as never,
        };
      },
    };

    const result = await executeCheckOutBooking(client, domain, {
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-a",
      trustedCustomerId: "customer-a",
    });
    assert.equal(result.success, true);
    assert.equal(result.status, "completed");
    assert.deepEqual(statuses, ["complete"]);
  });

  it("tools require trustedCustomerId and ignore LLM companyId", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const ports = {
      async checkInBooking(input: Record<string, unknown>) {
        calls.push(input);
        return {
          success: true,
          bookingId: "booking-a",
          confirmationNumber: "BK-000015",
          status: "checked_in",
          checkedInAt: "t",
        };
      },
      async checkOutBooking(input: Record<string, unknown>) {
        calls.push(input);
        return {
          success: true,
          bookingId: "booking-a",
          confirmationNumber: "BK-000015",
          status: "completed",
          checkedOutAt: "t",
        };
      },
    } as unknown as SchedulingToolPorts;

    const checkIn = createCheckInBookingTool(ports);
    const denied = await checkIn.execute(
      {
        companyId: "company-a",
        conversationId: "conv-1",
        conversationState: "waiting_user",
        userId: "user-1",
        trustedCustomerId: null,
      },
      { bookingId: "booking-a", companyId: "company-b" },
    );
    assert.equal(denied.success, false);
    assert.deepEqual(denied.errors, ["CUSTOMER_CONTEXT_REQUIRED"]);

    const ok = await checkIn.execute(
      {
        companyId: "company-a",
        conversationId: "conv-1",
        conversationState: "waiting_user",
        userId: "user-1",
        trustedCustomerId: "customer-a",
      },
      { bookingId: "booking-a", companyId: "company-b" },
    );
    assert.equal(ok.success, true);
    assert.equal(ok.confirmationNumber, "BK-000015");
    assert.match(String(ok.customerFacingMessage ?? ""), /BK-000015/);
    assert.doesNotMatch(String(ok.customerFacingMessage ?? ""), /[0-9A-F]{8}/i);
    assert.equal(calls[0]?.companyId, "company-a");
    assert.equal(calls[0]?.trustedCustomerId, "customer-a");
  });
});
