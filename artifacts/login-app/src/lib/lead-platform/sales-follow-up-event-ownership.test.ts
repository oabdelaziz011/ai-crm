import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

describe("P0 lead_qualified side-effect ownership", () => {
  it("event publisher owns follow-up scheduling and product-interest promotion", () => {
    const source = readFileSync(join(here, "lead-platform-factory.ts"), "utf8");
    assert.match(source, /export function createSalesFollowUpAwareLeadEventPublisher/);
    assert.match(source, /handleSalesFollowUpLeadLifecycleEvent/);
    assert.match(source, /applyStoredProductInterestAfterQualify/);
    assert.match(source, /event\.type === "lead_qualified"/);
    // Product-interest promotion is awaited (not fire-and-forget) so draft-quote
    // in the same turn can observe the opportunity.
    assert.match(source, /await applyStoredProductInterestAfterQualify/);
    assert.doesNotMatch(
      source,
      /void import\("@workspace\/opportunity-platform"\)/,
    );
    assert.match(source, /createLoginAppLeadPlatformServices/);
    assert.match(source, /lifecycle side effect failed/);
    assert.match(source, /product-interest.*side effect failed|after qualify side effect failed/);
  });

  it("integration qualifyLead does not duplicate schedule or product-interest side effects", () => {
    const source = readFileSync(
      join(here, "../integration/api/integration-api-gateway-service.ts"),
      "utf8",
    );
    const start = source.indexOf("async qualifyLead(");
    assert.ok(start >= 0);
    const nextMethod = source.indexOf("\n  async ", start + 1);
    const body = source.slice(start, nextMethod > start ? nextMethod : undefined);
    assert.match(body, /commands\.qualifyLead/);
    assert.doesNotMatch(body, /scheduleSalesFollowUpAfterLeadQualified/);
    assert.doesNotMatch(body, /applyStoredProductInterestAfterQualify/);
  });
});
