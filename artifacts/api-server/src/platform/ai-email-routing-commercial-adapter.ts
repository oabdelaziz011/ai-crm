import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiEmailRoutingCommercialPort } from "@workspace/channel-platform";
import {
  AI_EMAIL_ROUTING_FEATURE_CODE,
  AI_EMAIL_ROUTING_USAGE_METRIC_CODE,
} from "@workspace/channel-platform";

export type AiEmailRoutingCommercialAdapterOptions = {
  /**
   * Optional quota reader. When omitted or returns null limit, quota is not enforced
   * (existing architecture has no AI Email Routing hard quota yet).
   */
  resolveMonthlyLimit?: (companyId: string) => Promise<number | null>;
  /**
   * Optional current-period usage counter for quota checks.
   * When limit is set but counter is unavailable → fail closed for the commercial feature.
   */
  resolveMonthlyUsage?: (companyId: string) => Promise<number | null>;
};

function readLimitValue(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return raw;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    for (const key of ["monthly", "max", "limit", "count", "quantity"]) {
      const value = record[key];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
      if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
        return Number(value);
      }
    }
  }
  return null;
}

/**
 * Commercial gate + usage metering for AI Email Routing.
 * Entitlement SoT: public.is_feature_enabled (fail-closed).
 * Usage SoT: public.ingest_usage_event (idempotent via inbound event id).
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

      // Quota: only when existing limit_value / resolver provides a numeric limit.
      try {
        let limit: number | null = null;
        if (options.resolveMonthlyLimit) {
          limit = await options.resolveMonthlyLimit(companyId);
        } else {
          const { data: entitlements, error: entError } = await client.rpc("get_company_entitlements", {
            p_company_id: companyId,
          });
          if (entError) {
            return { allowed: false, reason: "entitlement_error" };
          }
          const rows = Array.isArray(entitlements) ? entitlements : [];
          const row = rows.find(
            (item) =>
              item &&
              typeof item === "object" &&
              String((item as { feature_code?: unknown }).feature_code ?? "") ===
                AI_EMAIL_ROUTING_FEATURE_CODE,
          ) as { limit_value?: unknown } | undefined;
          limit = readLimitValue(row?.limit_value);
        }

        if (limit == null) {
          // No configured quota policy → do not invent hard limits.
          return { allowed: true, reason: "entitled" };
        }

        let usage: number | null = null;
        if (options.resolveMonthlyUsage) {
          usage = await options.resolveMonthlyUsage(companyId);
        } else {
          const period = new Date().toISOString().slice(0, 7); // YYYY-MM
          const { data: usageRows, error: usageError } = await client
            .from("usage_records")
            .select("quantity")
            .eq("company_id", companyId)
            .eq("metric_code", AI_EMAIL_ROUTING_USAGE_METRIC_CODE)
            .eq("billing_period", period);
          if (usageError) {
            // Fail closed when a quota exists but usage cannot be read.
            return { allowed: false, reason: "entitlement_unavailable" };
          }
          usage = (usageRows ?? []).reduce(
            (sum, row) => sum + Number((row as { quantity?: unknown }).quantity ?? 0),
            0,
          );
        }

        if (usage == null) {
          return { allowed: false, reason: "entitlement_unavailable" };
        }
        if (usage >= limit) {
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
