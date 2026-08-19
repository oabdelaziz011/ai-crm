import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateQuotaAccess } from "./effective-quota-policy.js";
import type { EffectiveQuotaPolicy } from "./effective-quota-policy.js";
import { fetchCurrentBillingPeriodUsage } from "./fetch-metric-usage.js";
import { resolveEffectiveQuotaPolicy } from "./resolve-effective-quota-policy.js";

export const API_ACCESS_FEATURE_CODE = "api_access" as const;
export const API_CALLS_USAGE_METRIC_CODE = "api_calls" as const;

export type ApiCallsQuotaDecisionReason =
  | "allowed"
  | "quota_exceeded"
  | "quota_unavailable"
  | "quota_error";

export type ApiCallsQuotaDecision = {
  allowed: boolean;
  reason: ApiCallsQuotaDecisionReason;
};

export type ApiCallsCommercialAdapterOptions = {
  resolveQuotaPolicy?: (companyId: string) => Promise<EffectiveQuotaPolicy>;
  resolveMonthlyUsage?: (companyId: string) => Promise<number | null>;
};

export type ApiCallsCommercialPort = {
  /** Commercial quota only — api_access entitlement is enforced separately in api-auth. */
  checkQuota(input: { companyId: string }): Promise<ApiCallsQuotaDecision>;
  /** Best-effort metering via ingest_usage_event. Failure does not block callers. */
  recordUsage(input: {
    companyId: string;
    requestId: string;
    method?: string;
    path?: string;
  }): Promise<{ recorded: boolean; reason?: string }>;
};

/**
 * Commercial quota + usage metering for external API v1 calls.
 * Quota SoT: company_usage_limit_overrides → plan_features.limit_value (Task 4 resolver).
 * Usage SoT: usage_records via ingest_usage_event.
 *
 * Concurrency: checkQuota reads usage; recordUsage writes separately — best-effort, not atomic.
 */
export function createApiCallsCommercialPort(
  client: SupabaseClient,
  options: ApiCallsCommercialAdapterOptions = {},
): ApiCallsCommercialPort {
  return {
    async checkQuota(input) {
      const companyId = input.companyId?.trim();
      if (!companyId) {
        return { allowed: false, reason: "quota_unavailable" };
      }

      try {
        const policy = options.resolveQuotaPolicy
          ? await options.resolveQuotaPolicy(companyId)
          : await resolveEffectiveQuotaPolicy(client, {
              companyId,
              usageMetricCode: API_CALLS_USAGE_METRIC_CODE,
              featureCode: API_ACCESS_FEATURE_CODE,
            });

        const needsUsageCheck =
          policy.configured && !policy.unlimited && policy.included_quantity != null;

        if (!needsUsageCheck) {
          return { allowed: true, reason: "allowed" };
        }

        let usage: number | null = null;
        if (options.resolveMonthlyUsage) {
          usage = await options.resolveMonthlyUsage(companyId);
        } else {
          try {
            usage = await fetchCurrentBillingPeriodUsage(client, {
              companyId,
              usageMetricCode: API_CALLS_USAGE_METRIC_CODE,
            });
          } catch {
            return { allowed: false, reason: "quota_unavailable" };
          }
        }

        if (usage == null) {
          return { allowed: false, reason: "quota_unavailable" };
        }

        const decision = evaluateQuotaAccess(policy, usage);
        if (!decision.allowed) {
          return { allowed: false, reason: "quota_exceeded" };
        }

        return { allowed: true, reason: "allowed" };
      } catch {
        return { allowed: false, reason: "quota_error" };
      }
    },

    async recordUsage(input) {
      const companyId = input.companyId?.trim();
      const requestId = input.requestId?.trim();
      if (!companyId || !requestId) {
        return { recorded: false, reason: "missing_identity" };
      }

      const idempotencyKey = `api_calls:${companyId}:${requestId}`;
      try {
        const { data, error } = await client.rpc("ingest_usage_event", {
          p_company_id: companyId,
          p_metric_code: API_CALLS_USAGE_METRIC_CODE,
          p_quantity: 1,
          p_metadata: {
            featureCode: API_ACCESS_FEATURE_CODE,
            method: input.method ?? null,
            path: input.path ?? null,
          },
          p_idempotency_key: idempotencyKey,
          p_source: "api_v1",
          p_reference_type: "api_request",
          p_reference_id: requestId,
        });
        if (error) {
          return { recorded: false, reason: error.message.slice(0, 120) };
        }
        return { recorded: Boolean(data), reason: data ? "recorded" : "duplicate_or_empty" };
      } catch (error) {
        const message = error instanceof Error ? error.message : "usage_record_failed";
        return { recorded: false, reason: message.slice(0, 120) };
      }
    },
  };
}
