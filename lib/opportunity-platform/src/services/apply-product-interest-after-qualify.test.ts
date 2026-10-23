import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideProductInterestOpportunity } from "./opportunity-product-interest.js";
import { applyStoredProductInterestAfterQualify } from "./apply-product-interest-after-qualify.js";

describe("product interest after qualify gate", () => {
  it("preserves interest for later qualify when product is verified", () => {
    const decision = decideProductInterestOpportunity({
      companyId: "co-1",
      leadId: "lead-1",
      catalogProductId: "prod-1",
      matchCount: 1,
      productCompanyId: "co-1",
    });
    assert.equal(decision.action, "reuse_or_create");
  });

  it("does not promote ambiguous interest after qualify", () => {
    const decision = decideProductInterestOpportunity({
      companyId: "co-1",
      leadId: "lead-1",
      catalogProductId: "prod-1",
      matchCount: 3,
      productCompanyId: "co-1",
    });
    assert.deepEqual(decision, { action: "skip", reason: "ambiguous_product" });
  });

  it("does not promote product interest when the lead is not qualified", async () => {
    const client = {
      from(table: string) {
        assert.equal(table, "leads");
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          is() {
            return this;
          },
          async maybeSingle() {
            return {
              data: {
                id: "lead-1",
                metadata: { productInterest: { productId: "prod-1", productName: "Widget" } },
                customer_id: null,
                is_qualified: false,
                title: "Lead",
                contact_name: "Ada",
              },
              error: null,
            };
          },
        };
      },
    };
    const result = await applyStoredProductInterestAfterQualify(client as never, {
      companyId: "co-1",
      leadId: "lead-1",
    });
    assert.equal(result.applied, false);
    assert.equal(result.reason, "lead_not_qualified");
  });
});
