/**
 * Phase 5L — Login-App check_in / check_out must use the same company + trustedCustomerId
 * ownership boundary as webhook (executeCheckInBooking / executeCheckOutBooking).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createCheckInBookingTool,
  createCheckOutBookingTool,
  type BookingDomainServicePort,
} from "@workspace/ai-tool-router";
import { createApplicationLayerSchedulingToolPorts } from "./application-layer-scheduling-tool-ports.js";

type Row = Record<string, unknown>;

function createMemoryClient(seed: { bookings: Row[]; companyId?: string }) {
  const bookings = [...seed.bookings];
  const companyId = seed.companyId ?? "company-a";

  function applyFilters(rows: Row[], filters: Array<{ col: string; op: string; val: unknown }>) {
    return rows.filter((row) =>
      filters.every((f) => {
        if (f.op === "eq") return row[f.col] === f.val;
        if (f.op === "is" && f.val === null) return row[f.col] == null;
        return true;
      }),
    );
  }

  const client = {
    from(table: string) {
      const filters: Array<{ col: string; op: string; val: unknown }> = [];
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = () => chain();
      builder.eq = (col: string, val: unknown) => {
        filters.push({ col, op: "eq", val });
        return chain();
      };
      builder.is = (col: string, val: unknown) => {
        filters.push({ col, op: "is", val });
        return chain();
      };
      builder.maybeSingle = async () => {
        const rows = applyFilters(table === "scheduling_bookings" ? bookings : [], filters);
        return { data: rows[0] ?? null, error: null };
      };
      return builder;
    },
  };

  return { client: client as unknown as SupabaseClient, bookings, companyId };
}

const bookingA: Row = {
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

function portContext(companyId = "company-a") {
  return {
    companyId,
    actorUserId: "user-1",
    isSuperAdmin: false,
    hasPermission: () => true,
  };
}

describe("Phase 5L login-app check_in / check_out ownership", () => {
  it("1. same-company + same-customer check_in → ALLOW", async () => {
    let mutated = false;
    const { client } = createMemoryClient({ bookings: [{ ...bookingA }] });
    const domain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async checkInBooking(input) {
        mutated = true;
        assert.equal(input.companyId, "company-a");
        assert.equal(input.bookingId, "booking-a");
        return {
          booking: {
            id: "booking-a",
            status: "checked_in",
            start_at: String(bookingA.start_at),
            company_id: "company-a",
            customer_id: "customer-a",
            confirmation_number: "CNF-A",
            updated_at: "2026-08-20T10:05:00.000Z",
          },
        };
      },
    };

    const ports = createApplicationLayerSchedulingToolPorts(portContext(), { client, bookingDomain: domain });
    const result = await ports.checkInBooking({
      companyId: "company-llm-spoof",
      userId: "user-1",
      bookingId: "booking-a",
      trustedCustomerId: "customer-a",
    });

    assert.equal(result.success, true);
    assert.equal(result.status, "checked_in");
    assert.equal(mutated, true);
  });

  it("2. same-company + same-customer check_out → ALLOW", async () => {
    let mutated = false;
    const { client } = createMemoryClient({
      bookings: [{ ...bookingA, status: "in_progress" }],
    });
    const domain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async completeBooking(input) {
        mutated = true;
        assert.equal(input.bookingId, "booking-a");
        return {
          booking: {
            id: "booking-a",
            status: "completed",
            start_at: String(bookingA.start_at),
            company_id: "company-a",
            customer_id: "customer-a",
            confirmation_number: "CNF-A",
            updated_at: "2026-08-20T11:00:00.000Z",
          },
        };
      },
    };

    const ports = createApplicationLayerSchedulingToolPorts(portContext(), { client, bookingDomain: domain });
    const result = await ports.checkOutBooking({
      companyId: "company-llm-spoof",
      userId: "user-1",
      bookingId: "booking-a",
      trustedCustomerId: "customer-a",
    });

    assert.equal(result.success, true);
    assert.equal(result.status, "completed");
    assert.equal(mutated, true);
  });

  it("3/4. same-company + different-customer → DENY; no mutation", async () => {
    let mutated = false;
    const { client } = createMemoryClient({ bookings: [{ ...bookingA }] });
    const domain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async checkInBooking() {
        mutated = true;
        throw new Error("should not run");
      },
      async completeBooking() {
        mutated = true;
        throw new Error("should not run");
      },
    };

    const ports = createApplicationLayerSchedulingToolPorts(portContext(), { client, bookingDomain: domain });

    const checkIn = await ports.checkInBooking({
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-a",
      trustedCustomerId: "customer-b",
    });
    assert.equal(checkIn.success, false);
    assert.deepEqual(checkIn.errors, ["CUSTOMER_OWNERSHIP_DENIED"]);

    const checkOut = await ports.checkOutBooking({
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-a",
      trustedCustomerId: "customer-b",
    });
    assert.equal(checkOut.success, false);
    assert.deepEqual(checkOut.errors, ["CUSTOMER_OWNERSHIP_DENIED"]);
    assert.equal(mutated, false);
  });

  it("5/6. cross-company booking → DENY; no mutation", async () => {
    let mutated = false;
    const { client } = createMemoryClient({
      bookings: [{ ...bookingA, company_id: "company-b" }],
      companyId: "company-b",
    });
    const domain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async checkInBooking() {
        mutated = true;
        throw new Error("should not run");
      },
      async completeBooking() {
        mutated = true;
        throw new Error("should not run");
      },
    };

    // Execution company is portContext company-a; booking lives in company-b.
    const ports = createApplicationLayerSchedulingToolPorts(portContext("company-a"), {
      client,
      bookingDomain: domain,
    });

    const checkIn = await ports.checkInBooking({
      companyId: "company-b",
      userId: "user-1",
      bookingId: "booking-a",
      trustedCustomerId: "customer-a",
    });
    assert.equal(checkIn.success, false);
    assert.deepEqual(checkIn.errors, ["booking_not_found"]);

    const checkOut = await ports.checkOutBooking({
      companyId: "company-b",
      userId: "user-1",
      bookingId: "booking-a",
      trustedCustomerId: "customer-a",
    });
    assert.equal(checkOut.success, false);
    assert.deepEqual(checkOut.errors, ["booking_not_found"]);
    assert.equal(mutated, false);
  });

  it("7/8. missing trustedCustomerId → DENY; no mutation", async () => {
    let mutated = false;
    const { client } = createMemoryClient({ bookings: [{ ...bookingA }] });
    const domain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async checkInBooking() {
        mutated = true;
        throw new Error("should not run");
      },
      async completeBooking() {
        mutated = true;
        throw new Error("should not run");
      },
    };

    const ports = createApplicationLayerSchedulingToolPorts(portContext(), { client, bookingDomain: domain });

    const checkIn = await ports.checkInBooking({
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-a",
      trustedCustomerId: null,
    });
    assert.equal(checkIn.success, false);
    assert.deepEqual(checkIn.errors, ["CUSTOMER_CONTEXT_REQUIRED"]);

    const checkOut = await ports.checkOutBooking({
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-a",
      trustedCustomerId: undefined,
    });
    assert.equal(checkOut.success, false);
    assert.deepEqual(checkOut.errors, ["CUSTOMER_CONTEXT_REQUIRED"]);
    assert.equal(mutated, false);
  });

  it("9. LLM customerId cannot override trustedCustomerId (tool boundary)", async () => {
    const seen: Array<{ trustedCustomerId?: string | null }> = [];
    const { client } = createMemoryClient({ bookings: [{ ...bookingA }] });
    const domain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async checkInBooking() {
        return {
          booking: {
            id: "booking-a",
            status: "checked_in",
            start_at: String(bookingA.start_at),
            company_id: "company-a",
            customer_id: "customer-a",
            confirmation_number: "CNF-A",
            updated_at: "2026-08-20T10:05:00.000Z",
          },
        };
      },
    };

    const ports = createApplicationLayerSchedulingToolPorts(portContext(), {
      client,
      bookingDomain: {
        ...domain,
        async checkInBooking(input) {
          return domain.checkInBooking!(input);
        },
      },
    });

    // Wrap to capture trustedCustomerId reaching the port.
    const wrapped = {
      ...ports,
      async checkInBooking(input: Parameters<typeof ports.checkInBooking>[0]) {
        seen.push({ trustedCustomerId: input.trustedCustomerId });
        return ports.checkInBooking(input);
      },
    };

    const tool = createCheckInBookingTool(wrapped);
    const denied = await tool.execute(
      {
        companyId: "company-a",
        userId: "user-1",
        conversationId: "conv-1",
        conversationState: "waiting_user",
        trustedCustomerId: null,
      },
      { bookingId: "booking-a", customerId: "customer-a" },
    );
    assert.equal(denied.success, false);
    assert.deepEqual(denied.errors, ["CUSTOMER_CONTEXT_REQUIRED"]);
    assert.equal(seen.length, 0);

    const ok = await tool.execute(
      {
        companyId: "company-a",
        userId: "user-1",
        conversationId: "conv-1",
        conversationState: "waiting_user",
        trustedCustomerId: "customer-a",
      },
      { bookingId: "booking-a", customerId: "customer-b" },
    );
    assert.equal(ok.success, true);
    assert.equal(seen[0]?.trustedCustomerId, "customer-a");
  });

  it("10/11. ownership deny causes no mutation; invalid lifecycle still enforced after ownership", async () => {
    let mutated = false;
    const { client } = createMemoryClient({ bookings: [{ ...bookingA }] });
    const domain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async checkInBooking() {
        mutated = true;
        throw new Error("INVALID_STATUS_TRANSITION: cancelled → checked_in");
      },
      async completeBooking() {
        mutated = true;
        throw new Error("INVALID_STATUS_TRANSITION: confirmed → completed");
      },
    };

    const ports = createApplicationLayerSchedulingToolPorts(portContext(), { client, bookingDomain: domain });

    const wrongCustomer = await ports.checkInBooking({
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-a",
      trustedCustomerId: "customer-other",
    });
    assert.equal(wrongCustomer.success, false);
    assert.equal(mutated, false);

    const lifecycle = await ports.checkInBooking({
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-a",
      trustedCustomerId: "customer-a",
    });
    assert.equal(lifecycle.success, false);
    assert.deepEqual(lifecycle.errors, ["invalid_status"]);
    assert.equal(mutated, true);

    mutated = false;
    const checkOutLifecycle = await ports.checkOutBooking({
      companyId: "company-a",
      userId: "user-1",
      bookingId: "booking-a",
      trustedCustomerId: "customer-a",
    });
    assert.equal(checkOutLifecycle.success, false);
    assert.deepEqual(checkOutLifecycle.errors, ["invalid_status"]);
  });

  it("12. trusted portContext.companyId wins over LLM companyId on check_out tool path", async () => {
    const seenCompany: string[] = [];
    const { client } = createMemoryClient({ bookings: [{ ...bookingA, status: "in_progress" }] });
    const domain: BookingDomainServicePort = {
      async createBooking() {
        throw new Error("unused");
      },
      async completeBooking(input) {
        seenCompany.push(input.companyId);
        return {
          booking: {
            id: "booking-a",
            status: "completed",
            start_at: String(bookingA.start_at),
            company_id: "company-a",
            customer_id: "customer-a",
            confirmation_number: "CNF-A",
            updated_at: "2026-08-20T11:00:00.000Z",
          },
        };
      },
    };

    const ports = createApplicationLayerSchedulingToolPorts(portContext("company-a"), {
      client,
      bookingDomain: domain,
    });
    const tool = createCheckOutBookingTool(ports);
    const result = await tool.execute(
      {
        companyId: "company-a",
        userId: "user-1",
        conversationId: "conv-1",
        conversationState: "waiting_user",
        trustedCustomerId: "customer-a",
      },
      { bookingId: "booking-a", companyId: "company-attacker" },
    );
    assert.equal(result.success, true);
    assert.deepEqual(seenCompany, ["company-a"]);
  });
});
