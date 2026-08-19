import type { SupabaseClient } from "@supabase/supabase-js";

/** Current billing-period usage from usage_records (same semantics as AI Email Routing). */
export async function fetchCurrentBillingPeriodUsage(
  client: SupabaseClient,
  input: { companyId: string; usageMetricCode: string; now?: Date },
): Promise<number> {
  const companyId = input.companyId.trim();
  const usageMetricCode = input.usageMetricCode.trim();
  const period = (input.now ?? new Date()).toISOString().slice(0, 7);

  const { data: usageRows, error } = await client
    .from("usage_records")
    .select("quantity")
    .eq("company_id", companyId)
    .eq("metric_code", usageMetricCode)
    .eq("billing_period", period);

  if (error) {
    throw new Error(error.message);
  }

  return (usageRows ?? []).reduce(
    (sum, row) => sum + Number((row as { quantity?: unknown }).quantity ?? 0),
    0,
  );
}
