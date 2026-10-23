import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RuntimeToolRouteResult, ServiceContext } from "@workspace/ai-execution-engine";
import { applyToolScopeBeforeRoute } from "./scoped-runtime-tool-port.js";
import { runWithEmployeeToolScope } from "./tool-scope-context.js";

const ctx = {
  userId: "user-1",
  companyId: "company-1",
  isSuperAdmin: false,
  hasPermission: () => true,
} as ServiceContext;

function routeReturningPrice(): {
  route: () => Promise<RuntimeToolRouteResult>;
} {
  return {
    async route() {
      return {
        executionId: "exec-1",
        toolKey: "search_products",
        status: "succeeded",
        output: {
          products: [
            {
              name: "Headphones",
              price: { status: "listed", amount: 249.5, currency: "USD" },
              subscription: { amount: 9.99, currency: "USD", interval: "month" },
              cost: 40,
              margin_percent: 60,
            },
          ],
        },
        durationMs: 1,
        errorCode: null,
        errorMessage: null,
      };
    },
  };
}

describe("server product price policy", () => {
  it("strips prices before the model sees a product tool result when the setting is off", async () => {
    const result = await runWithEmployeeToolScope(
      { allowedToolKeys: ["search_products"], employeeId: "employee-1", showProductPrices: false },
      () =>
        applyToolScopeBeforeRoute(routeReturningPrice(), ctx, {
          conversationId: "conv-1",
          toolKey: "search_products",
          input: { query: "headphones" },
        }, {
          commercialEntitlement: { isFeatureEnabled: async () => true },
        }),
    );
    const product = (result.output as { products: Array<Record<string, unknown>> }).products[0]!;
    assert.deepEqual(product.price, { status: "not_listed" });
    assert.equal("subscription" in product, false);
    assert.equal("cost" in product, false);
    assert.equal("margin_percent" in product, false);
    assert.ok(!JSON.stringify(result.output).includes("249.5"));
  });

  it("keeps a recorded price when the owner enabled the setting", async () => {
    const result = await runWithEmployeeToolScope(
      { allowedToolKeys: ["search_products"], employeeId: "employee-1", showProductPrices: true },
      () =>
        applyToolScopeBeforeRoute(routeReturningPrice(), ctx, {
          conversationId: "conv-1",
          toolKey: "search_products",
          input: { query: "headphones" },
        }, {
          commercialEntitlement: { isFeatureEnabled: async () => true },
        }),
    );
    const product = (result.output as { products: Array<Record<string, unknown>> }).products[0]!;
    assert.deepEqual(product.price, { status: "listed", amount: 249.5, currency: "USD" });
    assert.equal("cost" in product, false);
    assert.equal("margin_percent" in product, false);
  });

  it("hides prices when no employee scope is active", async () => {
    const result = await applyToolScopeBeforeRoute(routeReturningPrice(), ctx, {
      conversationId: "conv-1",
      toolKey: "get_product_details",
      input: { productIds: ["d0000000-0000-4000-8000-000000000001"] },
    });
    const product = (result.output as { products: Array<Record<string, unknown>> }).products[0]!;
    assert.deepEqual(product.price, { status: "not_listed" });
  });
});
