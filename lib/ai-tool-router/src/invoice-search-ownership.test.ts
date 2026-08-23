/**
 * Phase 5C — invoice_search trusted-customer ownership.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseCrmAgentToolPorts } from "./adapters/supabase-crm-agent-tool-ports.js";
import {
  createCrmAgentTools,
  INVOICE_CUSTOMER_CONTEXT_REQUIRED_MESSAGE,
} from "./tools/crm-agent-tools.js";
import type { CrmAgentToolPorts, CrmInvoiceSummary } from "./tools/crm-agent-ports.js";
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

function createMemoryInvoiceClient(seed: { invoices: Row[]; companyId?: string }) {
  const invoices = [...seed.invoices];
  const companyId = seed.companyId ?? "company-a";

  function applyFilters(rows: Row[], filters: Array<{ col: string; op: string; val: unknown }>) {
    return rows.filter((row) =>
      filters.every((f) => {
        if (f.op === "eq") return row[f.col] === f.val;
        if (f.op === "lt") return String(row[f.col] ?? "") < String(f.val);
        if (f.op === "in" && Array.isArray(f.val)) return f.val.includes(row[f.col]);
        return true;
      }),
    );
  }

  const client = {
    from(table: string) {
      const filters: Array<{ col: string; op: string; val: unknown }> = [];
      let limitN = 100;
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = () => chain();
      builder.eq = (col: string, val: unknown) => {
        filters.push({ col, op: "eq", val });
        return chain();
      };
      builder.in = (col: string, val: unknown[]) => {
        filters.push({ col, op: "in", val });
        return chain();
      };
      builder.lt = (col: string, val: unknown) => {
        filters.push({ col, op: "lt", val });
        return chain();
      };
      builder.order = () => chain();
      builder.limit = (n: number) => {
        limitN = n;
        return chain();
      };
      builder.then = undefined;
      // Thenable for await query
      const run = async () => {
        if (table !== "invoices") return { data: [], error: null };
        // Always require company filter from seed company for isolation checks
        const rows = applyFilters(invoices, filters).slice(0, limitN);
        // Cross-company: if company filter doesn't match seed company rows already filtered by eq
        void companyId;
        return { data: rows, error: null };
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

const seedInvoices: Row[] = [
  {
    id: "inv-a",
    company_id: "company-a",
    customer_id: "customer-a",
    invoice_type: "customer",
    total_cents: 10000,
    status: "issued",
    due_at: "2026-09-01T00:00:00.000Z",
  },
  {
    id: "inv-b",
    company_id: "company-a",
    customer_id: "customer-b",
    invoice_type: "customer",
    total_cents: 25000,
    status: "issued",
    due_at: "2026-09-02T00:00:00.000Z",
  },
  {
    id: "inv-null",
    company_id: "company-a",
    customer_id: null,
    invoice_type: "customer",
    total_cents: 5000,
    status: "issued",
    due_at: "2026-09-03T00:00:00.000Z",
  },
  {
    id: "inv-other-co",
    company_id: "company-b",
    customer_id: "customer-a",
    invoice_type: "customer",
    total_cents: 99999,
    status: "issued",
    due_at: "2026-09-04T00:00:00.000Z",
  },
];

describe("Phase 5C invoice_search ownership", () => {
  it("TEST 1 — same customer: returns only trusted customer invoices", async () => {
    const ports = createSupabaseCrmAgentToolPorts(
      createMemoryInvoiceClient({ invoices: seedInvoices }),
    );
    const tools = createCrmAgentTools(ports);
    const output = await tools.invoice_search!.execute(baseContext(), {});

    assert.equal(output.success, true);
    assert.equal(output.total, 1);
    assert.equal(output.invoices[0].id, "inv-a");
    assert.equal(output.invoices[0].customer_id, "customer-a");
  });

  it("TEST 2 — cross-customer: customer B invoice not returned", async () => {
    const ports = createSupabaseCrmAgentToolPorts(
      createMemoryInvoiceClient({ invoices: seedInvoices }),
    );
    const tools = createCrmAgentTools(ports);
    const output = await tools.invoice_search!.execute(baseContext(), {});

    assert.equal(output.success, true);
    const ids = (output.invoices as CrmInvoiceSummary[]).map((i) => i.id);
    assert.equal(ids.includes("inv-b"), false);
    assert.equal(ids.includes("inv-a"), true);
  });

  it("TEST 3 — missing trusted customer: DENY, no company-wide leak", async () => {
    let portCalled = false;
    const ports: CrmAgentToolPorts = {
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
        portCalled = true;
        return {
          invoices: [
            {
              id: "inv-a",
              customer_id: "customer-a",
              amount: 100,
              status: "issued",
              due_date: null,
            },
            {
              id: "inv-b",
              customer_id: "customer-b",
              amount: 250,
              status: "issued",
              due_date: null,
            },
          ],
          total: 2,
        };
      },
      async searchBookings() {
        return { bookings: [], total: 0 };
      },
      async knowledgeSearch() {
        return { results: [], contextText: "" };
      },
    };

    const tools = createCrmAgentTools(ports);
    const output = await tools.invoice_search!.execute(baseContext({ trustedCustomerId: null }), {});

    assert.equal(output.success, false);
    assert.equal(output.errorCode, "CUSTOMER_CONTEXT_REQUIRED");
    assert.deepEqual(output.errors, ["CUSTOMER_CONTEXT_REQUIRED"]);
    assert.equal(output.message, INVOICE_CUSTOMER_CONTEXT_REQUIRED_MESSAGE);
    assert.deepEqual(output.invoices, []);
    assert.deepEqual(output.results, []);
    assert.equal(output.total, 0);
    assert.equal(portCalled, false);
  });

  it("TEST 4 — LLM customerId cannot override trusted customer", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const ports: CrmAgentToolPorts = {
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
      async searchInvoices(input) {
        seen.push(input as unknown as Record<string, unknown>);
        return {
          invoices: [
            {
              id: "inv-a",
              customer_id: input.trustedCustomerId ?? null,
              amount: 100,
              status: "issued",
              due_date: null,
            },
          ],
          total: 1,
        };
      },
      async searchBookings() {
        return { bookings: [], total: 0 };
      },
      async knowledgeSearch() {
        return { results: [], contextText: "" };
      },
    };

    const tools = createCrmAgentTools(ports);
    const output = await tools.invoice_search!.execute(baseContext(), {
      customerId: "customer-b",
      status: "issued",
    });

    assert.equal(output.success, true);
    assert.equal(seen[0]?.trustedCustomerId, "customer-a");
    assert.notEqual(seen[0]?.trustedCustomerId, "customer-b");
    assert.equal(seen[0]?.customerId, undefined);
  });

  it("TEST 5 — cross-company invoice not returned", async () => {
    const ports = createSupabaseCrmAgentToolPorts(
      createMemoryInvoiceClient({ invoices: seedInvoices }),
    );
    const tools = createCrmAgentTools(ports);
    const output = await tools.invoice_search!.execute(baseContext({ companyId: "company-a" }), {});

    assert.equal(output.success, true);
    const ids = (output.invoices as CrmInvoiceSummary[]).map((i) => i.id);
    assert.equal(ids.includes("inv-other-co"), false);
  });

  it("TEST 6 — customerless invoices not exposed", async () => {
    const ports = createSupabaseCrmAgentToolPorts(
      createMemoryInvoiceClient({ invoices: seedInvoices }),
    );
    const tools = createCrmAgentTools(ports);
    const output = await tools.invoice_search!.execute(baseContext(), {});

    assert.equal(output.success, true);
    const ids = (output.invoices as CrmInvoiceSummary[]).map((i) => i.id);
    assert.equal(ids.includes("inv-null"), false);
  });

  it("adapter fails closed when trustedCustomerId omitted", async () => {
    const ports = createSupabaseCrmAgentToolPorts(
      createMemoryInvoiceClient({ invoices: seedInvoices }),
    );
    const result = await ports.searchInvoices({
      companyId: "company-a",
      userId: "user-1",
      trustedCustomerId: null,
    });
    assert.deepEqual(result.invoices, []);
    assert.equal(result.total, 0);
    assert.deepEqual(result.errors, ["CUSTOMER_CONTEXT_REQUIRED"]);
  });
});
