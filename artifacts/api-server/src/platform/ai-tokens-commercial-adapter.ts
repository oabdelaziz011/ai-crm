import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiTokensCommercialPort } from "@workspace/ai-execution-engine";
import {
  AI_ASSISTANT_FEATURE_CODE,
  AI_TOKENS_USAGE_METRIC_CODE,
} from "@workspace/ai-execution-engine";
import { evaluateQuotaAccess } from "../lib/quota/effective-quota-policy.js";
import { fetchCurrentBillingPeriodUsage } from "../lib/quota/fetch-metric-usage.js";
import { resolveEffectiveQuotaPolicy } from "../lib/quota/resolve-effective-quota-policy.js";
import type { EffectiveQuotaPolicy } from "../lib/quota/effective-quota-policy.js";

export type AiTokensCommercialAdapterOptions = {
  resolveQuotaPolicy?: (companyId: string) => Promise<EffectiveQuotaPolicy>;
  resolveMonthlyUsage?: (companyId: string) => Promise<number | null>;
};

/**
 * Commercial gate + usage metering for AI Assistant tokens.
 * Entitlement SoT: public.is_feature_enabled (fail-closed).
 * Quota SoT: company_usage_limit_overrides → plan_features.limit_value (unified resolver).
 * Usage SoT: public.ingest_usage_event (idempotent by company + execution id).
 *
 * Counting policy: SUCCESS-ONLY provider-reported total_tokens.
 *
 * Concurrency: checkAccess reads usage then decides; recordUsage writes separately.
 * Concurrent requests can both pass before either records — best-effort, not atomic.
 */
export function createAiTokensCommercialPort(
  client: SupabaseClient,
  options: AiTokensCommercialAdapterOptions = {},
): AiTokensCommercialPort {
  return {
    async checkAccess(input) {
      const companyId = input.companyId?.trim();
      if (!companyId) {
        return { allowed: false, reason: "entitlement_unavailable" };
      }

      try {
        const { data, error } = await client.rpc("is_feature_enabled", {
          p_company_id: companyId,
          p_feature_code: AI_ASSISTANT_FEATURE_CODE,
        });
        if (error) {
          return { allowed: false, reason: "entitlement_error" };
        }
        if (!data) {
          return { allowed: false, reason: "not_entitled" };
        }
      } catch {
        return { allowed: false, reason: "entitlement_error" };
      }

      try {
        const policy = options.resolveQuotaPolicy
          ? await options.resolveQuotaPolicy(companyId)
          : await resolveEffectiveQuotaPolicy(client, {
              companyId,
              usageMetricCode: AI_TOKENS_USAGE_METRIC_CODE,
              featureCode: AI_ASSISTANT_FEATURE_CODE,
            });

        const needsUsageCheck =
          policy.configured && !policy.unlimited && policy.included_quantity != null;

        if (!needsUsageCheck) {
          return { allowed: true, reason: "entitled" };
        }

        let usage: number | null = null;
        if (options.resolveMonthlyUsage) {
          usage = await options.resolveMonthlyUsage(companyId);
        } else {
          try {
            usage = await fetchCurrentBillingPeriodUsage(client, {
              companyId,
              usageMetricCode: AI_TOKENS_USAGE_METRIC_CODE,
            });
          } catch {
            return { allowed: false, reason: "entitlement_unavailable" };
          }
        }

        if (usage == null) {
          return { allowed: false, reason: "entitlement_unavailable" };
        }

        const decision = evaluateQuotaAccess(policy, usage);
        if (!decision.allowed) {
          return { allowed: false, reason: "quota_exceeded" };
        }

        return { allowed: true, reason: "entitled" };
      } catch {
        return { allowed: false, reason: "entitlement_error" };
      }
    },

    async recordUsage(input) {
      const companyId = input.companyId?.trim();
      const executionId = input.executionId?.trim();
      const quantity = Number(input.quantity);
      if (!companyId || !executionId) {
        return { recorded: false, reason: "missing_ids" };
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return { recorded: false, reason: "invalid_quantity" };
      }

      const idempotencyKey = `ai_tokens:${companyId}:${executionId}`;
      try {
        const { data, error } = await client.rpc("ingest_usage_event", {
          p_company_id: companyId,
          p_metric_code: AI_TOKENS_USAGE_METRIC_CODE,
          p_quantity: quantity,
          p_metadata: {
            featureCode: AI_ASSISTANT_FEATURE_CODE,
            executionId,
          },
          p_idempotency_key: idempotencyKey,
          p_recorded_at: new Date().toISOString(),
          p_source: "ai_execution_engine",
          p_reference_type: "ai_execution",
          p_reference_id: executionId,
        });
        if (error) {
          return { recorded: false, reason: "ingest_failed" };
        }
        return { recorded: Boolean(data), reason: data ? "recorded" : "duplicate_or_empty" };
      } catch {
        return { recorded: false, reason: "ingest_error" };
      }
    },
  };
}
