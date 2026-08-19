import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateOveragePreview } from "../src/lib/billing/usage-overage.ts";
import {
  aggregateUsageByMetric,
  currentUtcBillingPeriod,
  fetchCompanyCurrentPeriodUsage,
  metricUsageForPreview,
} from "../src/lib/billing/fetch-current-period-usage.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const workspace = readFileSync(
  join(root, "artifacts/login-app/src/components/companies/approval/company-approval-workspace.tsx"),
  "utf8",
);

// 9. Approval Workspace must not use snapshots for current-period preview
assert.match(workspace, /useCompanyCurrentPeriodUsage/);
assert.doesNotMatch(workspace, /useCompanyUsageSnapshot/);
assert.match(workspace, /metricUsageForPreview/);
assert.match(workspace, /usageQuery\.isError/);

// 8. UTC YYYY-MM matches runtime quota convention
assert.equal(currentUtcBillingPeriod(new Date("2026-08-15T23:59:59.000Z")), "2026-08");
assert.equal(currentUtcBillingPeriod(new Date("2026-09-01T00:00:00.000Z")), "2026-09");

// 1–3. Enforced metrics aggregate correctly
const augustRows = [
  { metric_code: "ai_email_routing", quantity: 2 },
  { metric_code: "api_calls", quantity: 10 },
  { metric_code: "ai_employee_email", quantity: 1 },
  { metric_code: "api_calls", quantity: 5 },
];
const augustTotals = aggregateUsageByMetric(augustRows);
assert.equal(augustTotals.ai_email_routing, 2);
assert.equal(augustTotals.api_calls, 15);
assert.equal(augustTotals.ai_employee_email, 1);

// 4. Multiple records summed (covered above)

// 5. No rows → empty map → preview null for metric
assert.deepEqual(aggregateUsageByMetric([]), {});
assert.equal(metricUsageForPreview({}, "api_calls"), null);

// 7. Previous month excluded via fetch filter (mock client)
const calls: Array<{ companyId: string; period: string }> = [];
const mockClient = {
  from(table: string) {
    assert.equal(table, "usage_records");
    const filters: Record<string, string> = {};
    return {
      select() {
        return this;
      },
      eq(column: string, value: string) {
        filters[column] = value;
        return this;
      },
      then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
        calls.push({ companyId: filters.company_id, period: filters.billing_period });
        const rows =
          filters.company_id === "co-a" && filters.billing_period === "2026-08"
            ? [{ metric_code: "api_calls", quantity: 7 }]
            : filters.company_id === "co-b"
              ? [{ metric_code: "api_calls", quantity: 99 }]
              : [{ metric_code: "api_calls", quantity: 1, billing_period: "2026-07" }];
        return Promise.resolve(resolve({ data: rows, error: null }));
      },
    };
  },
};

void (async () => {
  const live = await fetchCompanyCurrentPeriodUsage(
    mockClient as never,
    "co-a",
    new Date("2026-08-18T12:00:00.000Z"),
  );
  assert.equal(live.api_calls, 7);
  assert.equal(calls[0]?.period, "2026-08");

  // 6. Company A vs B isolation
  const b = await fetchCompanyCurrentPeriodUsage(
    mockClient as never,
    "co-b",
    new Date("2026-08-18T12:00:00.000Z"),
  );
  assert.equal(b.api_calls, 99);
  assert.notEqual(live.api_calls, b.api_calls);

  // 10. Stale snapshot vs live — live path uses usage_records only
  assert.equal(metricUsageForPreview({ api_calls: 42 }, "api_calls"), 42);

  // 11. Overage preview receives live usage
  const preview = calculateOveragePreview({
    metricCode: "api_calls",
    usage: live.api_calls,
    override: {
      metric_code: "api_calls",
      included_quantity: 5,
      is_unlimited: false,
      overage_allowed: true,
      overage_unit_size: 1,
      overage_unit_price: 2,
    },
  });
  assert.ok(preview);
  assert.equal(preview?.usage, 7);
  assert.equal(preview?.overageQuantity, 2);

  // 12. Query failure must not become zero usage in preview wiring
  assert.equal(metricUsageForPreview(undefined, "api_calls"), null);

  let fetchRejected = false;
  try {
    await fetchCompanyCurrentPeriodUsage(
      {
        from() {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            then(_resolve: unknown, reject: (error: Error) => void) {
              reject(new Error("db unavailable"));
            },
          };
        },
      } as never,
      "co-a",
    );
  } catch (error) {
    fetchRejected = true;
    assert.match(error instanceof Error ? error.message : String(error), /db unavailable/);
  }
  assert.equal(fetchRejected, true);

  // 13. calculateOveragePreview unchanged for null usage
  assert.equal(calculateOveragePreview({ metricCode: "x", usage: null, override: null }), null);

  console.log("current-period-usage-preview.test.mts: ok");
})();
