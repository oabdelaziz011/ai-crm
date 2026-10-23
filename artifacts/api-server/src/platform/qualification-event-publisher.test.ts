import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const factory = readFileSync(
  fileURLToPath(
    new URL(
      "../../../login-app/src/lib/lead-platform/lead-platform-factory.ts",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("inbound qualification event publisher", () => {
  it("awaits product-interest promotion only after lead_qualified", () => {
    const publisher = factory.slice(
      factory.indexOf("export function createSalesFollowUpAwareLeadEventPublisher"),
      factory.indexOf("export function createLoginAppLeadPlatformServices"),
    );
    assert.match(publisher, /if \(event\.type === "lead_qualified"\)/);
    assert.match(publisher, /await applyStoredProductInterestAfterQualify/);
    const qualified = publisher.slice(publisher.indexOf('event.type === "lead_qualified"'));
    assert.match(qualified, /await applyStoredProductInterestAfterQualify/);
    const beforeQualified = publisher.slice(0, publisher.indexOf('event.type === "lead_qualified"'));
    assert.doesNotMatch(beforeQualified, /applyStoredProductInterestAfterQualify/);
  });

  it("wires that publisher into the shared login lead platform", () => {
    assert.match(
      factory,
      /events: createSalesFollowUpAwareLeadEventPublisher\(client, createLeadEventBridge\(\)\)/,
    );
  });
});
