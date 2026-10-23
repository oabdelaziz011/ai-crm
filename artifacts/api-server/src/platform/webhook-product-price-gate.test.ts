import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createProductAgentTools } from "@workspace/ai-tool-router";
import { runWithEmployeeToolScope } from "./employee-runtime-bridge.js";
import { createWebhookProductAgentPorts } from "./webhook-product-agent-ports.js";

const COMPANY = "aaaaaaaa-0000-4000-8000-000000000001";
const PRODUCT = "d0000000-0000-4000-8000-000000000001";
const INTERNAL_KEYS = ["cost", "margin_percent", "marginPercent", "stock_quantity", "stockQuantity", "tax_class", "tax_percent", "taxPercent", "metadata"];

function assertNoInternalKeys(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value) assertNoInternalKeys(entry);
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    assert.equal(INTERNAL_KEYS.includes(key), false, key);
    assertNoInternalKeys(nested);
  }
}

function fakeClient(): SupabaseClient {
  const products = [
    {
      id: PRODUCT,
      company_id: COMPANY,
      category_id: null,
      product_type: "product",
      name: "Webhook Headphones",
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

describe("webhook product ports", () => {
  it("hides prices unless the active employee scope explicitly enables them", async () => {
    const ports = createWebhookProductAgentPorts(fakeClient());
    const search = createProductAgentTools(ports).search_products!;
    const run = () => search.execute(
      { companyId: COMPANY, conversationId: "conv-1", conversationState: "waiting_user", userId: null },
      { query: "WH-100" },
    ) as Promise<{ products: Array<{ price: { status: string; amount?: number } }> }>;

    assert.equal(ports.showProductPrices?.(), false);
    const missing = await run();
    assert.equal(missing.products[0].price.status, "not_listed");
    assert.ok(!JSON.stringify(missing).includes("249.5"));

    const hidden = await runWithEmployeeToolScope(
      { allowedToolKeys: ["search_products"], employeeId: "employee-1", showProductPrices: false },
      run,
    );
    assert.equal(hidden.products[0].price.status, "not_listed");

    const invalid = await runWithEmployeeToolScope(
      { allowedToolKeys: ["search_products"], employeeId: "employee-1", showProductPrices: "yes" as never },
      run,
    );
    assert.equal(invalid.products[0].price.status, "not_listed");
    assert.equal(hidden.products[0].price.status, "not_listed");
    for (const payload of [missing, hidden, invalid]) {
      assert.ok(!JSON.stringify(payload).includes("249.5"));
      assertNoInternalKeys(payload);
    }

    const shown = await runWithEmployeeToolScope(
      { allowedToolKeys: ["search_products"], employeeId: "employee-1", showProductPrices: true },
      run,
    );
    assert.equal(shown.products[0].price.amount, 249.5);
    assertNoInternalKeys(shown);
  });
});
