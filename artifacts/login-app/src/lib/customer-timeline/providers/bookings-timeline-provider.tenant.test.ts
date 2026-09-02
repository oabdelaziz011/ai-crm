import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const providerSrc = readFileSync(
  join(__dirname, "bookings-timeline-provider.ts"),
  "utf8",
);

/**
 * Extract the legacy public.bookings query block for contract assertions.
 */
function legacyBookingsQueryBlock(src: string): string {
  const marker = '.from("bookings")';
  const start = src.indexOf(marker);
  assert.ok(start >= 0, "legacy bookings query must exist");
  const end = src.indexOf(".order(", start);
  assert.ok(end > start, "legacy bookings query must order results");
  return src.slice(start, end);
}

function schedulingBookingsQueryBlock(src: string): string {
  const marker = '.from("scheduling_bookings")';
  const start = src.indexOf(marker);
  assert.ok(start >= 0, "scheduling_bookings query must exist");
  const end = src.indexOf(".order(", start);
  assert.ok(end > start, "scheduling_bookings query must order results");
  return src.slice(start, end);
}

describe("BookingsTimelineProvider — legacy tenant isolation", () => {
  it("requires companyId + customerId and fails closed when either missing", () => {
    assert.match(
      providerSrc,
      /if \(!trimmedCompanyId \|\| !trimmedCustomerId\) \{\s*return \[\];\s*\}/,
    );
  });

  it("legacy bookings query applies BOTH company_id and customer_id server-side", () => {
    const block = legacyBookingsQueryBlock(providerSrc);
    assert.match(block, /\.eq\("company_id", trimmedCompanyId\)/);
    assert.match(block, /\.eq\("customer_id", trimmedCustomerId\)/);
    // Must not query customer_id alone before company_id was added.
    assert.doesNotMatch(block, /\.eq\("customer_id", customerId\)/);
  });

  it("scheduling_bookings path still uses company_id + customer_id", () => {
    const block = schedulingBookingsQueryBlock(providerSrc);
    assert.match(block, /\.eq\("company_id", trimmedCompanyId\)/);
    assert.match(block, /\.eq\("customer_id", trimmedCustomerId\)/);
    assert.match(block, /\.is\("deleted_at", null\)/);
  });

  it("does not use phone / email / last-9 association", () => {
    assert.doesNotMatch(providerSrc, /\.eq\("phone"|phone_e164|last.?9|endsWith\(/);
    assert.doesNotMatch(providerSrc, /\.eq\("email"/);
  });

  it("documents tenant contract for same/cross company cases via dual predicates", () => {
    // Same company + same customer → included by both eqs
    // Same company + different customer → excluded by customer_id eq
    // Different company + same customer UUID → excluded by company_id eq
    const legacy = legacyBookingsQueryBlock(providerSrc);
    const companyPos = legacy.indexOf('.eq("company_id"');
    const customerPos = legacy.indexOf('.eq("customer_id"');
    assert.ok(companyPos >= 0 && customerPos >= 0);
    assert.ok(companyPos < customerPos, "company_id predicate should precede customer_id");
  });
});
