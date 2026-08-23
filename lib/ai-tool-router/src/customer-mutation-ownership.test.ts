/**
 * Phase 5J.1 — customer mutation ownership hardening (port + tool boundary).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseCrmAgentToolPorts } from "./adapters/supabase-crm-agent-tool-ports.js";
import { createCrmAgentTools } from "./tools/crm-agent-tools.js";
import type { ToolExecutionContext } from "./tools/tool-contract.js";

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";
const CUST_A1 = "cust-a-1";
const CUST_A2 = "cust-a-2";
const CUST_B1 = "cust-b-1";
const CUST_B2 = "cust-b-2";

type CustomerRow = {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type MutationLog = {
  table: string;
  op: "update" | "delete" | "insert";
  payload?: Record<string, unknown>;
  filters: Array<{ col: string; val: unknown }>;
};

function baseContext(overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return {
    companyId: COMPANY_A,
    conversationId: "conv-1",
    conversationState: "waiting_user",
    userId: "user-1",
    ...overrides,
  };
}

function createMutationClient(seed: { customers: CustomerRow[] }) {
  const customers = seed.customers.map((c) => ({ ...c }));
  const mutations: MutationLog[] = [];

  function from(table: string) {
    const filters: Array<{ col: string; val: unknown }> = [];
    let updatePayload: Record<string, unknown> | null = null;
    let isDelete = false;
    let isInsert = false;
    let insertPayload: Record<string, unknown> | null = null;
    let headOnly = false;

    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    builder.select = (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      headOnly = opts?.head === true;
      return chain();
    };
    builder.insert = (payload: Record<string, unknown>) => {
      isInsert = true;
      insertPayload = payload;
      return chain();
    };
    builder.update = (payload: Record<string, unknown>) => {
      updatePayload = payload;
      return chain();
    };
    builder.delete = () => {
      isDelete = true;
      return chain();
    };
    builder.eq = (col: string, val: unknown) => {
      filters.push({ col, val });
      return chain();
    };
    builder.order = () => chain();
    builder.limit = () => chain();
    builder.single = async () => {
      const result = await run();
      if (result.error) return result;
      const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
      if (rows.length === 0) return { data: null, error: { message: "not found" } };
      return { data: rows[0], error: null };
    };
    builder.maybeSingle = async () => {
      const result = await run();
      if (result.error) return result;
      const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
      return { data: rows[0] ?? null, error: null };
    };

    async function run(): Promise<{
      data: unknown;
      error: { message: string } | null;
      count?: number;
    }> {
      if (table === "customers") {
        if (isInsert && insertPayload) {
          mutations.push({ table, op: "insert", payload: insertPayload, filters: [...filters] });
          const row = {
            id: `cust-new-${customers.length + 1}`,
            name: String(insertPayload.name ?? ""),
            email: insertPayload.email == null ? null : String(insertPayload.email),
            phone: insertPayload.phone == null ? null : String(insertPayload.phone),
            company_id: String(insertPayload.company_id),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            age: null,
            gender: null,
            notes: null,
          };
          customers.push({
            id: row.id,
            company_id: row.company_id,
            name: row.name,
            email: row.email,
            phone: row.phone,
          });
          return { data: row, error: null };
        }

        if (isDelete) {
          mutations.push({ table, op: "delete", filters: [...filters] });
          const idFilter = filters.find((f) => f.col === "id")?.val;
          const companyFilter = filters.find((f) => f.col === "company_id")?.val;
          const idx = customers.findIndex(
            (c) => c.id === idFilter && c.company_id === companyFilter,
          );
          if (idx >= 0) customers.splice(idx, 1);
          return { data: null, error: null };
        }

        if (updatePayload) {
          mutations.push({
            table,
            op: "update",
            payload: { ...updatePayload },
            filters: [...filters],
          });
          const idFilter = filters.find((f) => f.col === "id")?.val;
          const companyFilter = filters.find((f) => f.col === "company_id")?.val;
          const row = customers.find((c) => c.id === idFilter && c.company_id === companyFilter);
          if (!row) return { data: null, error: { message: "Customer not found" } };
          Object.assign(row, updatePayload);
          return {
            data: {
              id: row.id,
              name: row.name,
              email: row.email,
              phone: row.phone,
              age: null,
              gender: null,
              notes: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            error: null,
          };
        }

        const rows = customers.filter((c) =>
          filters.every((f) => (c as Record<string, unknown>)[f.col] === f.val),
        );
        if (headOnly) {
          return { data: null, error: null, count: rows.length };
        }
        return { data: rows, error: null, count: rows.length };
      }

      if (updatePayload) {
        mutations.push({
          table,
          op: "update",
          payload: { ...updatePayload },
          filters: [...filters],
        });
        return { data: null, error: null };
      }

      return { data: [], error: null };
    }

    (builder as { then?: typeof Promise.prototype.then }).then = (
      onFulfilled: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => run().then(onFulfilled, onRejected);

    return builder;
  }

  return {
    client: { from } as unknown as SupabaseClient,
    mutations,
    customers,
  };
}

describe("Phase 5J.1 customer mutation ownership", () => {
  describe("merge_customers", () => {
    it("1. same-company primary + duplicate → PASS and mutates", async () => {
      const { client, mutations } = createMutationClient({
        customers: [
          { id: CUST_A1, company_id: COMPANY_A, name: "Ada", email: null, phone: "1" },
          { id: CUST_A2, company_id: COMPANY_A, name: "Ada Dup", email: null, phone: "1" },
        ],
      });
      const ports = createSupabaseCrmAgentToolPorts(client);
      const result = await ports.mergeCustomers({
        companyId: COMPANY_A,
        userId: "user-1",
        primaryCustomerId: CUST_A1,
        duplicateCustomerIds: [CUST_A2],
        confirmed: true,
      });
      assert.equal(result.merged, true);
      assert.equal(result.mergedCount, 1);
      assert.ok(mutations.some((m) => m.op === "delete" && m.table === "customers"));
      assert.ok(mutations.some((m) => m.table === "bookings" && m.op === "update"));
    });

    it("2. cross-company primary → DENY; no mutation", async () => {
      const { client, mutations } = createMutationClient({
        customers: [
          { id: CUST_B1, company_id: COMPANY_B, name: "Bob", email: null, phone: null },
          { id: CUST_A2, company_id: COMPANY_A, name: "Ada", email: null, phone: null },
        ],
      });
      const ports = createSupabaseCrmAgentToolPorts(client);
      await assert.rejects(
        () =>
          ports.mergeCustomers({
            companyId: COMPANY_A,
            userId: "user-1",
            primaryCustomerId: CUST_B1,
            duplicateCustomerIds: [CUST_A2],
            confirmed: true,
          }),
        /not found for this company/i,
      );
      assert.equal(mutations.length, 0);
    });

    it("3. cross-company duplicate → DENY; no mutation", async () => {
      const { client, mutations } = createMutationClient({
        customers: [
          { id: CUST_A1, company_id: COMPANY_A, name: "Ada", email: null, phone: null },
          { id: CUST_B1, company_id: COMPANY_B, name: "Bob", email: null, phone: null },
        ],
      });
      const ports = createSupabaseCrmAgentToolPorts(client);
      await assert.rejects(
        () =>
          ports.mergeCustomers({
            companyId: COMPANY_A,
            userId: "user-1",
            primaryCustomerId: CUST_A1,
            duplicateCustomerIds: [CUST_B1],
            confirmed: true,
          }),
        /not found for this company/i,
      );
      assert.equal(mutations.length, 0);
    });

    it("4. both foreign to execution company → DENY; no mutation", async () => {
      const { client, mutations } = createMutationClient({
        customers: [
          { id: CUST_B1, company_id: COMPANY_B, name: "Bob", email: null, phone: null },
          { id: CUST_B2, company_id: COMPANY_B, name: "Bob2", email: null, phone: null },
        ],
      });
      const ports = createSupabaseCrmAgentToolPorts(client);
      await assert.rejects(
        () =>
          ports.mergeCustomers({
            companyId: COMPANY_A,
            userId: "user-1",
            primaryCustomerId: CUST_B1,
            duplicateCustomerIds: [CUST_B2],
            confirmed: true,
          }),
        /not found for this company/i,
      );
      assert.equal(mutations.length, 0);
    });

    it("5. missing company → DENY", async () => {
      const { client, mutations } = createMutationClient({
        customers: [
          { id: CUST_A1, company_id: COMPANY_A, name: "Ada", email: null, phone: null },
          { id: CUST_A2, company_id: COMPANY_A, name: "Ada2", email: null, phone: null },
        ],
      });
      const ports = createSupabaseCrmAgentToolPorts(client);
      await assert.rejects(
        () =>
          ports.mergeCustomers({
            companyId: "",
            userId: "user-1",
            primaryCustomerId: CUST_A1,
            duplicateCustomerIds: [CUST_A2],
            confirmed: true,
          }),
        /Company context is required/i,
      );
      assert.equal(mutations.length, 0);
    });

    it("6. missing confirmation → DENY before mutation", async () => {
      const { client, mutations } = createMutationClient({
        customers: [
          { id: CUST_A1, company_id: COMPANY_A, name: "Ada", email: null, phone: null },
          { id: CUST_A2, company_id: COMPANY_A, name: "Ada2", email: null, phone: null },
        ],
      });
      const ports = createSupabaseCrmAgentToolPorts(client);
      const result = await ports.mergeCustomers({
        companyId: COMPANY_A,
        userId: "user-1",
        primaryCustomerId: CUST_A1,
        duplicateCustomerIds: [CUST_A2],
        confirmed: false,
      });
      assert.equal(result.merged, false);
      assert.equal(mutations.length, 0);

      const tools = createCrmAgentTools(ports);
      const toolResult = await tools.merge_customers.execute(baseContext(), {
        primaryCustomerId: CUST_A1,
        duplicateCustomerIds: [CUST_A2],
      });
      assert.equal(toolResult.success, false);
      assert.equal(toolResult.requiresConfirmation, true);
      assert.equal(mutations.length, 0);
    });

    it("7. nonexistent primary → DENY; no mutation", async () => {
      const { client, mutations } = createMutationClient({
        customers: [{ id: CUST_A2, company_id: COMPANY_A, name: "Ada2", email: null, phone: null }],
      });
      const ports = createSupabaseCrmAgentToolPorts(client);
      await assert.rejects(
        () =>
          ports.mergeCustomers({
            companyId: COMPANY_A,
            userId: "user-1",
            primaryCustomerId: "missing-primary",
            duplicateCustomerIds: [CUST_A2],
            confirmed: true,
          }),
        /not found for this company/i,
      );
      assert.equal(mutations.length, 0);
    });

    it("8. nonexistent duplicate → DENY; no mutation", async () => {
      const { client, mutations } = createMutationClient({
        customers: [{ id: CUST_A1, company_id: COMPANY_A, name: "Ada", email: null, phone: null }],
      });
      const ports = createSupabaseCrmAgentToolPorts(client);
      await assert.rejects(
        () =>
          ports.mergeCustomers({
            companyId: COMPANY_A,
            userId: "user-1",
            primaryCustomerId: CUST_A1,
            duplicateCustomerIds: ["missing-dup"],
            confirmed: true,
          }),
        /not found for this company/i,
      );
      assert.equal(mutations.length, 0);
    });
  });

  describe("update_customer", () => {
    it("11. same-company update → PASS", async () => {
      const { client } = createMutationClient({
        customers: [
          { id: CUST_A1, company_id: COMPANY_A, name: "Ada", email: null, phone: "111" },
        ],
      });
      const ports = createSupabaseCrmAgentToolPorts(client);
      const tools = createCrmAgentTools(ports);
      const result = await tools.update_customer.execute(baseContext(), {
        customerId: CUST_A1,
        field: "phone",
        value: "999",
        companyId: COMPANY_B,
      });
      assert.equal(result.success, true);
      assert.equal(result.customerId, CUST_A1);
    });

    it("12/13. cross-company update DENY; LLM companyId ignored", async () => {
      const { client, mutations } = createMutationClient({
        customers: [
          { id: CUST_B1, company_id: COMPANY_B, name: "Bob", email: null, phone: null },
        ],
      });
      const ports = createSupabaseCrmAgentToolPorts(client);
      const tools = createCrmAgentTools(ports);
      await assert.rejects(
        () =>
          tools.update_customer.execute(baseContext({ companyId: COMPANY_A }), {
            customerId: CUST_B1,
            field: "phone",
            value: "999",
            companyId: COMPANY_B,
          }),
        /not found for this company/i,
      );
      assert.equal(
        mutations.filter((m) => m.op === "update" && m.table === "customers").length,
        0,
      );
    });

    it("14. missing company → DENY", async () => {
      const { client } = createMutationClient({
        customers: [
          { id: CUST_A1, company_id: COMPANY_A, name: "Ada", email: null, phone: null },
        ],
      });
      const ports = createSupabaseCrmAgentToolPorts(client);
      const tools = createCrmAgentTools(ports);
      await assert.rejects(
        () =>
          tools.update_customer.execute(baseContext({ companyId: "" }), {
            customerId: CUST_A1,
            field: "phone",
            value: "999",
          }),
        /Company context is required/i,
      );
    });
  });

  describe("import_customers", () => {
    it("15/16. import under trusted company; LLM companyId ignored", async () => {
      const { client, customers } = createMutationClient({ customers: [] });
      const ports = createSupabaseCrmAgentToolPorts(client, {
        getActorUserId: () => "user-1",
      });
      const tools = createCrmAgentTools(ports);
      const result = await tools.import_customers.execute(baseContext({ companyId: COMPANY_A }), {
        rows: [{ name: "New Cust", phone: "5551234567" }],
        confirmed: true,
        companyId: COMPANY_B,
      });
      assert.equal((result as { imported: number }).imported, 1);
      assert.equal(customers[0]?.company_id, COMPANY_A);
    });

    it("17. missing company → DENY", async () => {
      const { client } = createMutationClient({ customers: [] });
      const ports = createSupabaseCrmAgentToolPorts(client);
      const tools = createCrmAgentTools(ports);
      await assert.rejects(
        () =>
          tools.import_customers.execute(baseContext({ companyId: "" }), {
            rows: [{ name: "X" }],
            confirmed: true,
          }),
        /Company context is required/i,
      );
    });

    it("18. missing confirmation → DENY", async () => {
      const { client, customers } = createMutationClient({ customers: [] });
      const ports = createSupabaseCrmAgentToolPorts(client);
      const tools = createCrmAgentTools(ports);
      const result = await tools.import_customers.execute(baseContext(), {
        rows: [{ name: "X" }],
      });
      assert.equal(result.success, false);
      assert.equal(result.requiresConfirmation, true);
      assert.equal(customers.length, 0);
    });
  });
});
