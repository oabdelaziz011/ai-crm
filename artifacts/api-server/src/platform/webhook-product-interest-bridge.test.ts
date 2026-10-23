import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordVerifiedProductInterestForConversation } from "./webhook-product-interest-bridge.js";

const COMPANY = "aaaaaaaa-0000-4000-8000-000000000001";
const CONVERSATION = "conv-1";
const LEAD = "lead-1";
const PRODUCT = "d0000000-0000-4000-8000-000000000001";

type Row = Record<string, unknown>;

/** Minimal chainable fake: tables hold rows; filters are eq/is; records every lead update. */
function createFakeClient(tables: Record<string, Row[]>) {
  const updates: Array<{ table: string; patch: Row }> = [];
  const inserts: Array<{ table: string; row: Row }> = [];
  const client = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let pendingUpdate: Row | null = null;
      const rows = () => (tables[table] ?? []).filter((row) => filters.every((fn) => fn(row)));
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
        is: (column: string, value: unknown) =>
          (filters.push((row) => (value === null ? row[column] == null : row[column] === value)), builder),
        order: () => builder,
        limit: () => builder,
        update: (patch: Row) => ((pendingUpdate = patch), builder),
        insert: async (row: Row) => {
          inserts.push({ table, row });
          return { error: null };
        },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (value: { data: Row[]; error: null }) => unknown) => {
          if (pendingUpdate) {
            updates.push({ table, patch: pendingUpdate });
            for (const row of rows()) Object.assign(row, pendingUpdate);
            return Promise.resolve({ data: [], error: null }).then(resolve);
          }
          return Promise.resolve({ data: rows(), error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, updates, inserts };
}

function seed(leadMetadata: Row = {}, productCompany = COMPANY): Record<string, Row[]> {
  return {
    conversations: [
      { id: CONVERSATION, lead_id: LEAD, customer_id: null, company_id: COMPANY, deleted_at: null },
    ],
    catalog_products: [{ id: PRODUCT, company_id: productCompany, name: "Clinic Management", deleted_at: null }],
    leads: [
      {
        id: LEAD,
        company_id: COMPANY,
        metadata: leadMetadata,
        customer_id: null,
        is_qualified: false,
        lifecycle_status: "new",
        deleted_at: null,
      },
    ],
    opportunities: [],
    opportunity_line_items: [],
  };
}

const input = {
  companyId: COMPANY,
  conversationId: CONVERSATION,
  productId: PRODUCT,
  productName: "Clinic Management",
};

describe("recordVerifiedProductInterestForConversation", () => {
  it("stores productInterest on the lead and preserves unrelated metadata", async () => {
    const tables = seed({ source: "whatsapp", tags: ["vip"], productInterest: undefined });
    const { client, updates, inserts } = createFakeClient(tables);
    const result = await recordVerifiedProductInterestForConversation(client, input);
    assert.deepEqual(result, { linked: true, reason: "lead_interest_recorded" });
    const metadata = tables.leads![0]!.metadata as Record<string, unknown>;
    assert.equal(metadata.source, "whatsapp");
    assert.deepEqual(metadata.tags, ["vip"]);
    assert.equal(metadata.productName, "Clinic Management");
    const interest = metadata.productInterest as Record<string, unknown>;
    assert.equal(interest.productId, PRODUCT);
    assert.equal(interest.source, "search_products_unambiguous_match");
    assert.equal(updates.filter((entry) => entry.table === "leads").length, 1);
    // Opportunity creation is deferred until qualify.
    assert.equal(inserts.length, 0);
  });

  it("is idempotent when the same product interest is already recorded", async () => {
    const tables = seed({ productInterest: { productId: PRODUCT, source: "earlier" } });
    const { client, updates } = createFakeClient(tables);
    const result = await recordVerifiedProductInterestForConversation(client, input);
    assert.deepEqual(result, { linked: true, reason: "already_recorded" });
    assert.equal(updates.length, 0);
    assert.equal(
      ((tables.leads![0]!.metadata as Record<string, unknown>).productInterest as Record<string, unknown>).source,
      "earlier",
    );
  });

  it("does not link a product from another company or a conversation without a lead", async () => {
    const foreign = createFakeClient(seed({}, "bbbbbbbb-0000-4000-8000-000000000002"));
    assert.deepEqual(await recordVerifiedProductInterestForConversation(foreign.client, input), {
      linked: false,
      reason: "product_not_in_company",
    });
    assert.equal(foreign.updates.length, 0);

    const noLead = seed();
    noLead.conversations![0]!.lead_id = null;
    const bare = createFakeClient(noLead);
    assert.deepEqual(await recordVerifiedProductInterestForConversation(bare.client, input), {
      linked: false,
      reason: "no_lead",
    });
    assert.deepEqual(
      await recordVerifiedProductInterestForConversation(bare.client, { ...input, conversationId: null }),
      { linked: false, reason: "no_conversation" },
    );
  });
});
