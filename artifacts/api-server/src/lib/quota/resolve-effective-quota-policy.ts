import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveEffectiveQuotaPolicyFromSources,
  type CompanyUsageLimitOverrideRow,
  type EffectiveQuotaPolicy,
} from "./effective-quota-policy.js";

export type ResolveEffectiveQuotaPolicyInput = {
  companyId: string;
  usageMetricCode: string;
  /** When known, skips feature_definitions lookup for plan limit_value. */
  featureCode?: string;
};

async function resolveFeatureCodeForMetric(
  client: SupabaseClient,
  usageMetricCode: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("feature_definitions")
    .select("code")
    .eq("linked_usage_metric_code", usageMetricCode)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.code ?? null;
}

async function fetchPlanLimitValue(
  client: SupabaseClient,
  companyId: string,
  featureCode: string,
): Promise<unknown> {
  const { data: entitlements, error } = await client.rpc("get_company_entitlements", {
    p_company_id: companyId,
  });
  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(entitlements) ? entitlements : [];
  const row = rows.find(
    (item) =>
      item &&
      typeof item === "object" &&
      String((item as { feature_code?: unknown }).feature_code ?? "") === featureCode,
  ) as { limit_value?: unknown } | undefined;

  return row?.limit_value ?? null;
}

/**
 * Server-side quota resolver. Uses trusted Supabase client (service_role in api-server).
 * company_id must come from authenticated server context — never untrusted browser input alone.
 */
export async function resolveEffectiveQuotaPolicy(
  client: SupabaseClient,
  input: ResolveEffectiveQuotaPolicyInput,
): Promise<EffectiveQuotaPolicy> {
  const companyId = input.companyId.trim();
  const usageMetricCode = input.usageMetricCode.trim();
  if (!companyId || !usageMetricCode) {
    return resolveEffectiveQuotaPolicyFromSources({
      companyOverride: null,
      planLimitValue: null,
    });
  }

  const { data: overrideRow, error: overrideError } = await client
    .from("company_usage_limit_overrides")
    .select(
      "included_quantity, is_unlimited, overage_allowed, overage_unit_size, overage_unit_price",
    )
    .eq("company_id", companyId)
    .eq("metric_code", usageMetricCode)
    .eq("is_active", true)
    .maybeSingle();

  if (overrideError) {
    throw new Error(overrideError.message);
  }

  const companyOverride = (overrideRow as CompanyUsageLimitOverrideRow | null) ?? null;

  const featureCode =
    input.featureCode?.trim() ||
    (await resolveFeatureCodeForMetric(client, usageMetricCode));

  let planLimitValue: unknown = null;
  if (featureCode) {
    planLimitValue = await fetchPlanLimitValue(client, companyId, featureCode);
  }

  return resolveEffectiveQuotaPolicyFromSources({
    companyOverride,
    planLimitValue,
  });
}
