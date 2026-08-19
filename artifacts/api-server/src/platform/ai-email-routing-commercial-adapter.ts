import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiEmailRoutingCommercialPort } from "@workspace/channel-platform";
import {
  AI_EMAIL_ROUTING_FEATURE_CODE,
  AI_EMAIL_ROUTING_USAGE_METRIC_CODE,
} from "@workspace/channel-platform";
import { evaluateQuotaAccess } from "../lib/quota/effective-quota-policy.js";
import { fetchCurrentBillingPeriodUsage } from "../lib/quota/fetch-metric-usage.js";
import { resolveEffectiveQuotaPolicy } from "../lib/quota/resolve-effective-quota-policy.js";
import type { EffectiveQuotaPolicy } from "../lib/quota/effective-quota-policy.js";

export type AiEmailRoutingCommercialAdapterOptions = {
  /**
   * Optional quota policy resolver for tests. Production uses unified server-side resolver.
   */
  resolveQuotaPolicy?: (companyId: string) => Promise<EffectiveQuotaPolicy>;
  /**
   * Optional current-period usage counter for quota checks.
   * When quota is configured but counter is unavailable → fail closed for the commercial feature.
   */
  resolveMonthlyUsage?: (companyId: string) => Promise<number | null>;
};

/**
 * Commercial gate + usage metering for AI Email Routing.
 * Entitlement SoT: public.is_feature_enabled (fail-closed).
 * Quota SoT: company_usage_limit_overrides → plan_features.limit_value (unified resolver).
 * Usage SoT: public.usage_records via ingest_usage_event (idempotent by inbound event id).
 *
 * Concurrency: checkAccess reads usage then decides; recordUsage writes separately.
 * Concurrent requests can both pass before either records — best-effort, not atomic.
 */
export function createAiEmailRoutingCommercialPort(
  client: SupabaseClient,
  options: AiEmailRoutingCommercialAdapterOptions = {},
): AiEmailRoutingCommercialPort {
  return {
    async checkAccess(input) {
      const companyId = input.companyId?.trim();
      if (!companyId) {
        return { allowed: false, reason: "entitlement_unavailable" };
      }

      try {
        const { data, error } = await client.rpc("is_feature_enabled", {
          p_company_id: companyId,
          p_feature_code: AI_EMAIL_ROUTING_FEATURE_CODE,
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
              usageMetricCode: AI_EMAIL_ROUTING_USAGE_METRIC_CODE,
              featureCode: AI_EMAIL_ROUTING_FEATURE_CODE,
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
              usageMetricCode: AI_EMAIL_ROUTING_USAGE_METRIC_CODE,
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
      const inboundEventId = input.inboundEventId?.trim();
      if (!companyId || !inboundEventId) {
        return { recorded: false, reason: "missing_identity" };
      }

      const idempotencyKey = `ai_email_routing:${companyId}:${inboundEventId}`;
      try {
        const { data, error } = await client.rpc("ingest_usage_event", {
          p_company_id: companyId,
          p_metric_code: AI_EMAIL_ROUTING_USAGE_METRIC_CODE,
          p_quantity: 1,
          p_metadata: {
            featureCode: AI_EMAIL_ROUTING_FEATURE_CODE,
            category: input.category ?? null,
            classificationSource: input.source ?? null,
          },
          p_idempotency_key: idempotencyKey,
          p_source: "ai_email_routing",
          p_reference_type: "channel_inbound_event",
          p_reference_id: inboundEventId,
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
