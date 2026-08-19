import type { SupabaseClient } from "@supabase/supabase-js";

/** UTC YYYY-MM — matches runtime quota (`fetch-metric-usage.ts` in api-server). */
export function currentUtcBillingPeriod(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export type UsageRecordQuantityRow = {
  metric_code: string;
  quantity: number | string | null;
};

/** Sum quantity by metric_code for current-period preview maps. */
export function aggregateUsageByMetric(
  rows: readonly UsageRecordQuantityRow[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    const code = String(row.metric_code ?? "").trim();
    if (!code) continue;
    const quantity = Number(row.quantity ?? 0);
    if (!Number.isFinite(quantity)) continue;
    totals[code] = (totals[code] ?? 0) + quantity;
  }
  return totals;
}

/**
 * Live current-period usage for a company from usage_records.
 * Returns metric_code → summed quantity (metrics with no rows are omitted).
 */
export async function fetchCompanyCurrentPeriodUsage(
  client: SupabaseClient,
  companyId: string,
  now: Date = new Date(),
): Promise<Record<string, number>> {
  const trimmedCompanyId = companyId.trim();
  if (!trimmedCompanyId) return {};

  const billingPeriod = currentUtcBillingPeriod(now);
  const { data, error } = await client
    .from("usage_records")
    .select("metric_code, quantity")
    .eq("company_id", trimmedCompanyId)
    .eq("billing_period", billingPeriod);

  if (error) {
    throw new Error(error.message);
  }

  return aggregateUsageByMetric((data ?? []) as UsageRecordQuantityRow[]);
}

/**
 * Preview usage for one metric. Absent metrics → null (unknown), matching prior snapshot UX.
 * Explicit zero usage → 0.
 */
export function metricUsageForPreview(
  metrics: Record<string, number> | null | undefined,
  metricCode: string,
): number | null {
  if (!metrics || !Object.prototype.hasOwnProperty.call(metrics, metricCode)) {
    return null;
  }
  const value = metrics[metricCode];
  return Number.isFinite(value) ? value : null;
}
