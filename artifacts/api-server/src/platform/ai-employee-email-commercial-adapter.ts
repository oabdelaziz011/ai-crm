import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiEmployeeEmailCommercialPort } from "@workspace/channel-platform";
import {
  AI_EMPLOYEE_EMAIL_USAGE_METRIC_CODE,
  AI_EMPLOYEE_FEATURE_CODE,
} from "@workspace/channel-platform";

/**
 * Commercial gate + usage metering for AI Employee Email replies.
 * Entitlement SoT: public.is_feature_enabled (fail-closed).
 * Usage SoT: public.ingest_usage_event (idempotent via inbound event id).
 */
export function createAiEmployeeEmailCommercialPort(
  client: SupabaseClient,
): AiEmployeeEmailCommercialPort {
  return {
    async checkAccess(input) {
      const companyId = input.companyId?.trim();
      if (!companyId) {
        return { allowed: false, reason: "entitlement_unavailable" };
      }

      try {
        const { data, error } = await client.rpc("is_feature_enabled", {
          p_company_id: companyId,
          p_feature_code: AI_EMPLOYEE_FEATURE_CODE,
        });
        if (error) {
          return { allowed: false, reason: "entitlement_error" };
        }
        if (!data) {
          return { allowed: false, reason: "not_entitled" };
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
        return { recorded: false, reason: "missing_ids" };
      }

      try {
        const { data, error } = await client.rpc("ingest_usage_event", {
          p_company_id: companyId,
          p_metric_code: AI_EMPLOYEE_EMAIL_USAGE_METRIC_CODE,
          p_quantity: 1,
          p_metadata: {
            channel: "email",
            ai_employee_id: input.aiEmployeeId ?? null,
          },
          p_idempotency_key: `ai_employee_email:${inboundEventId}`,
          p_recorded_at: new Date().toISOString(),
          p_source: "channel_platform",
          p_reference_type: "channel_inbound_event",
          p_reference_id: inboundEventId,
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
