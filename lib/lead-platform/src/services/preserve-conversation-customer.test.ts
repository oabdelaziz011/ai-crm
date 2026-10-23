import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { preserveTrustedConversationCustomer } from "./preserve-conversation-customer.js";

type Row = Record<string, unknown>;

function clientFor(tables: Record<string, Row | null>): SupabaseClient {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const chain = {
        select() {
          return chain;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return chain;
        },
        is() {
          return chain;
        },
        async maybeSingle() {
          const row = tables[table] ?? null;
          if (!row) return { data: null, error: null };
          for (const [column, value] of filters) {
            if (row[column] !== value) return { data: null, error: null };
          }
          return { data: row, error: null };
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

const companyId = "company-1";
const conversationId = "conv-1";
const leadId = "lead-1";
const customerId = "11111111-1111-4111-8111-111111111111";

describe("preserveTrustedConversationCustomer", () => {
  it("links the lead to the conversation customer in the same company", async () => {
    const linked: string[] = [];
    const result = await preserveTrustedConversationCustomer(
      clientFor({
        leads: { id: leadId, company_id: companyId, customer_id: null, deleted_at: null },
        conversations: { id: conversationId, company_id: companyId, customer_id: customerId, deleted_at: null },
        customers: { id: customerId, company_id: companyId, deleted_at: null },
      }),
      {
        companyId,
        conversationId,
        leadId,
        updateLeadCustomer: async (id) => {
          linked.push(id);
        },
      },
    );
    assert.equal(result, "linked");
    assert.deepEqual(linked, [customerId]);
  });

  it("does not create or replace a customer when the lead is already linked", async () => {
    let updates = 0;
    const result = await preserveTrustedConversationCustomer(
      clientFor({
        leads: { id: leadId, company_id: companyId, customer_id: customerId, deleted_at: null },
      }),
      {
        companyId,
        conversationId,
        leadId,
        updateLeadCustomer: async () => {
          updates += 1;
        },
      },
    );
    assert.equal(result, "already_linked");
    assert.equal(updates, 0);
  });

  it("keeps the lead when the conversation has no customer", async () => {
    let updates = 0;
    const result = await preserveTrustedConversationCustomer(
      clientFor({
        leads: { id: leadId, company_id: companyId, customer_id: null, deleted_at: null },
        conversations: { id: conversationId, company_id: companyId, customer_id: null, deleted_at: null },
      }),
      {
        companyId,
        conversationId,
        leadId,
        updateLeadCustomer: async () => {
          updates += 1;
        },
      },
    );
    assert.equal(result, "no_conversation_customer");
    assert.equal(updates, 0);
  });

  it("refuses a customer that belongs to another company", async () => {
    let updates = 0;
    const result = await preserveTrustedConversationCustomer(
      clientFor({
        leads: { id: leadId, company_id: companyId, customer_id: null, deleted_at: null },
        conversations: { id: conversationId, company_id: companyId, customer_id: customerId, deleted_at: null },
        customers: { id: customerId, company_id: "other-company", deleted_at: null },
      }),
      {
        companyId,
        conversationId,
        leadId,
        updateLeadCustomer: async () => {
          updates += 1;
        },
      },
    );
    assert.equal(result, "customer_not_in_company");
    assert.equal(updates, 0);
  });
});
