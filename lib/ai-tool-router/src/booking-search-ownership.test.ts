/**
 * Phase 5D — CRM booking_search trusted-customer ownership.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseCrmAgentToolPorts } from "./adapters/supabase-crm-agent-tool-ports.js";
import {
  BOOKING_SEARCH_CUSTOMER_CONTEXT_REQUIRED_MESSAGE,
  createCrmAgentTools,
} from "./tools/crm-agent-tools.js";
import type { CrmAgentToolPorts, CrmBookingSummary } from "./tools/crm-agent-ports.js";
import type { ToolExecutionContext } from "./tools/tool-contract.js";

type Row = Record<string, unknown>;

function baseContext(overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return {
    companyId: "company-a",
    conversationId: "conv-1",
    conversationState: "waiting_user",
    userId: "user-1",
    trustedCustomerId: "customer-a",
    ...overrides,
  };
}

function createMemoryBookingClient(seed: { scheduling: Row[]; legacy?: Row[] }) {
  const scheduling = [...seed.scheduling];
  const legacy = [...(seed.legacy ?? [])];

  function applyFilters(rows: Row[], filters: Array<{ col: string; op: string; val: unknown }>) {
    return rows.filter((row) =>
      filters.every((f) => {
        if (f.op === "eq") return row[f.col] === f.val;
        if (f.op === "is" && f.val === null) return row[f.col] == null;
        if (f.op === "not" && Array.isArray(f.val) && f.val[0] === "eq") {
          return row[f.col] !== f.val[1];
        }
        return true;
      }),
    );
  }

  const client = {
    from(table: string) {
      const filters: Array<{ col: string; op: string; val: unknown }> = [];
      let limitN = 200;
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
      builder.not = (col: string, op: string, val: unknown) => {
        filters.push({ col, op: "not", val: [op, val] });
        return chain();
      };
      builder.order = () => chain();
      builder.limit = (n: number) => {
        limitN = n;
        return chain();
      };
      const run = async () => {
        const rows = table === "scheduling_bookings" ? scheduling : table === "bookings" ? legacy : [];
        return { data: applyFilters(rows, filters).slice(0, limitN), error: null };
      };
      (builder as { then?: typeof Promise.prototype.then }).then = (
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) => run().then(onFulfilled, onRejected);
      return builder;
    },
  };

  return client as unknown as SupabaseClient;
}

const seedScheduling: Row[] = [
  {
    id: "bk-a",
    company_id: "company-a",
    customer_id: "customer-a",
    status: "confirmed",
    start_at: "2026-08-15T10:00:00.000Z",
    service_id: "svc-1",
    deleted_at: null,
  },
  {
    id: "bk-b",
    company_id: "company-a",
    customer_id: "customer-b",
    status: "confirmed",
    start_at: "2026-08-16T10:00:00.000Z",
    service_id: "svc-1",
    deleted_at: null,
  },
  {
    id: "bk-other-co",
    company_id: "company-b",
    customer_id: "customer-a",
    status: "confirmed",
    start_at: "2026-08-17T10:00:00.000Z",
    service_id: "svc-1",
    deleted_at: null,
  },
];

function stubPorts(overrides: Partial<CrmAgentToolPorts> = {}): CrmAgentToolPorts {
  return {
    async searchCustomers() {
      return { customers: [], total: 0 };
    },
    async updateCustomer() {
      throw new Error("unused");
    },
    async findDuplicateCustomers() {
      return { groups: [] };
    },
    async mergeCustomers() {
      throw new Error("unused");
    },
    async importCustomers() {
      throw new Error("unused");
    },
    async searchInvoices() {
      return { invoices: [], total: 0 };
    },
    async searchBookings() {
      return { bookings: [], total: 0 };
    },
    async knowledgeSearch() {
      return { results: [], contextText: "" };
    },
    ...overrides,
  };
}

describe("Phase 5D booking_search ownership", () => {
  it("TEST 1 — same customer: returns only trusted customer bookings", async () => {
    const ports = createSupabaseCrmAgentToolPorts(
      createMemoryBookingClient({ scheduling: seedScheduling }),
    );
    const tools = createCrmAgentTools(ports);
    const output = await tools.booking_search!.execute(baseContext(), { daysBack: 60 });

    assert.equal(output.success, true);
    assert.equal(output.total, 1);
    assert.equal(output.bookings[0].id, "bk-a");
    assert.equal(output.bookings[0].customer_id, "customer-a");
  });

  it("TEST 2 — cross-customer: customer B booking not returned", async () => {
    const ports = createSupabaseCrmAgentToolPorts(
      createMemoryBookingClient({ scheduling: seedScheduling }),
    );
    const tools = createCrmAgentTools(ports);
    const output = await tools.booking_search!.execute(baseContext(), { daysBack: 60 });

    const ids = (output.bookings as CrmBookingSummary[]).map((b) => b.id);
    assert.equal(ids.includes("bk-b"), false);
    assert.equal(ids.includes("bk-a"), true);
  });

  it("TEST 3 — missing trusted customer: DENY, no company-wide leak", async () => {
    let portCalled = false;
    const ports = stubPorts({
      async searchBookings() {
        portCalled = true;
        return {
          bookings: [
            {
              id: "bk-a",
              customer_id: "customer-a",
              service: null,
              status: "confirmed",
              scheduled_at: null,
            },
            {
              id: "bk-b",
              customer_id: "customer-b",
              service: null,
              status: "confirmed",
              scheduled_at: null,
            },
          ],
          total: 2,
        };
      },
    });

    const tools = createCrmAgentTools(ports);
    const output = await tools.booking_search!.execute(baseContext({ trustedCustomerId: null }), {});

    assert.equal(output.success, false);
    assert.equal(output.errorCode, "CUSTOMER_CONTEXT_REQUIRED");
    assert.deepEqual(output.errors, ["CUSTOMER_CONTEXT_REQUIRED"]);
    assert.equal(output.message, BOOKING_SEARCH_CUSTOMER_CONTEXT_REQUIRED_MESSAGE);
    assert.deepEqual(output.bookings, []);
    assert.deepEqual(output.results, []);
    assert.equal(output.total, 0);
    assert.equal(portCalled, false);
  });

  it("TEST 4 — LLM customerId cannot override trusted customer", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const ports = stubPorts({
      async searchBookings(input) {
        seen.push(input as unknown as Record<string, unknown>);
        return {
          bookings: [
            {
              id: "bk-a",
              customer_id: input.trustedCustomerId ?? null,
              service: null,
              status: "confirmed",
              scheduled_at: null,
            },
          ],
          total: 1,
        };
      },
    });

    const tools = createCrmAgentTools(ports);
    const output = await tools.booking_search!.execute(baseContext(), {
      customerId: "customer-b",
      daysBack: 30,
    });

    assert.equal(output.success, true);
    assert.equal(seen[0]?.trustedCustomerId, "customer-a");
    assert.notEqual(seen[0]?.trustedCustomerId, "customer-b");
    assert.equal(seen[0]?.customerId, undefined);
  });

  it("TEST 5 — cross-company booking not returned", async () => {
    const ports = createSupabaseCrmAgentToolPorts(
      createMemoryBookingClient({ scheduling: seedScheduling }),
    );
    const tools = createCrmAgentTools(ports);
    const output = await tools.booking_search!.execute(baseContext({ companyId: "company-a" }), {
      daysBack: 60,
    });

    const ids = (output.bookings as CrmBookingSummary[]).map((b) => b.id);
    assert.equal(ids.includes("bk-other-co"), false);
  });

  it("TEST 6 — login-app style port fails closed / trusted-only list", async () => {
    const listed: string[] = [];
    const ports = stubPorts({
      async searchBookings(input) {
        const trusted =
          typeof input.trustedCustomerId === "string" ? input.trustedCustomerId.trim() : "";
        if (!trusted) {
          return {
            bookings: [],
            total: 0,
            errors: ["CUSTOMER_CONTEXT_REQUIRED"],
            message: "Trusted customer context is required",
          };
        }
        // Mirrors Application Layer: listForCustomer(tenant, trusted) only — never queue.
        listed.push(trusted);
        assert.notEqual(input.customerId, "customer-b");
        return {
          bookings: [
            {
              id: "bk-a",
              customer_id: trusted,
              service: "Clinic",
              status: "confirmed",
              scheduled_at: "2026-08-15T10:00:00.000Z",
            },
          ],
          total: 1,
        };
      },
    });

    const tools = createCrmAgentTools(ports);
    const denied = await tools.booking_search!.execute(baseContext({ trustedCustomerId: null }), {
      customerId: "customer-b",
    });
    assert.equal(denied.success, false);
    assert.deepEqual(denied.bookings, []);

    const allowed = await tools.booking_search!.execute(baseContext(), { customerId: "customer-b" });
    assert.equal(allowed.success, true);
    assert.deepEqual(listed, ["customer-a"]);
    assert.equal(allowed.bookings[0].customer_id, "customer-a");
  });

  it("TEST 8 — no LLM-controlled ownership reaches query", async () => {
    const ports = createSupabaseCrmAgentToolPorts(
      createMemoryBookingClient({ scheduling: seedScheduling }),
    );
    const result = await ports.searchBookings({
      companyId: "company-a",
      userId: "user-1",
      trustedCustomerId: "customer-a",
      customerId: "customer-b",
      daysBack: 60,
    });
    assert.equal(result.total, 1);
    assert.equal(result.bookings[0]?.id, "bk-a");
    assert.equal(result.bookings.every((b) => b.customer_id === "customer-a"), true);
  });

  it("adapter fails closed when trustedCustomerId omitted", async () => {
    const ports = createSupabaseCrmAgentToolPorts(
      createMemoryBookingClient({ scheduling: seedScheduling }),
    );
    const result = await ports.searchBookings({
      companyId: "company-a",
      userId: "user-1",
      trustedCustomerId: null,
      customerId: "customer-a",
    });
    assert.deepEqual(result.bookings, []);
    assert.equal(result.total, 0);
    assert.deepEqual(result.errors, ["CUSTOMER_CONTEXT_REQUIRED"]);
  });
});
