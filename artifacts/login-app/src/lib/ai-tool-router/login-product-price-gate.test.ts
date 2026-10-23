import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createProductAgentTools } from "@workspace/ai-tool-router";
import { createLoginProductAgentPorts } from "@/lib/ai-tool-router/login-product-agent-ports";
import { runWithEmployeeToolScope } from "@/lib/ai-employees/utilities/tool-scope-context";

const COMPANY = "aaaaaaaa-0000-4000-8000-000000000001";
const PRODUCT = "d0000000-0000-4000-8000-000000000001";

function fakeClient(): SupabaseClient {
  const products = [
    {
      id: PRODUCT,
      company_id: COMPANY,
      category_id: null,
      product_type: "product",
      name: "Login Headphones",
      sku: "WH-100",
      brand: "Sonic",
      description: "Listed at 249.50 USD",
      base_price: 249.5,
      currency: "USD",
      cost: 40,
      margin_percent: 60,
      stock_quantity: 4,
      subscription_interval: null,
      subscription_price: null,
      unit: "each",
      tags: [],
      image_urls: [],
      is_active: true,
      deleted_at: null,
    },
  ];
  return {
    from(table: string) {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        is() {
          return builder;
        },
        in() {
          return builder;
        },
        or() {
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          const data = table === "catalog_products" ? products : [];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("login app product ports", () => {
  it("hides prices unless the active employee scope explicitly enables them", async () => {
    const ports = createLoginProductAgentPorts(fakeClient());
    const search = createProductAgentTools(ports).search_products!;
    const run = () => search.execute(
      { companyId: COMPANY, conversationId: "conv-1", conversationState: "waiting_user", userId: null },
      { query: "WH-100" },
    ) as Promise<{ products: Array<{ price: { status: string; amount?: number } }> }>;

    const missing = await run();
    assert.equal(missing.products[0].price.status, "not_listed");
    assert.ok(!JSON.stringify(missing).includes("249.5"));

    const invalid = await runWithEmployeeToolScope(
      { allowedToolKeys: ["search_products"], employeeId: "employee-1", showProductPrices: 1 as never },
      run,
    );
    assert.equal(invalid.products[0].price.status, "not_listed");

    const shown = await runWithEmployeeToolScope(
      { allowedToolKeys: ["search_products"], employeeId: "employee-1", showProductPrices: true },
      run,
    );
    assert.equal(shown.products[0].price.amount, 249.5);
    assert.ok(!JSON.stringify(shown).includes("margin"));
  });
});
