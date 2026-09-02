import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelCommercialEntitlementPort } from "@workspace/channel-platform";
import { resolveChannelCommercialFeatureCode } from "@workspace/channel-platform";

/**
 * Fail-closed per-channel commercial entitlement gate (entitlement only, no quota).
 * SoT: public.is_feature_enabled.
 */
export function createChannelCommercialEntitlementPort(
  client: SupabaseClient,
): ChannelCommercialEntitlementPort {
  return {
    async checkAccess(input) {
      const companyId = input.companyId?.trim();
      const channelKey = input.channelKey?.trim().toLowerCase();
      if (!companyId || !channelKey) {
        return {
          allowed: false,
          reason: "entitlement_unavailable",
          featureCode: resolveChannelCommercialFeatureCode(channelKey),
        };
      }

      const featureCode = resolveChannelCommercialFeatureCode(channelKey);
      if (!featureCode) {
        return { allowed: true, reason: "not_applicable", featureCode: null };
      }

      try {
        const { data, error } = await client.rpc("is_feature_enabled", {
          p_company_id: companyId,
          p_feature_code: featureCode,
        });
        if (error) {
          return { allowed: false, reason: "entitlement_error", featureCode };
        }
        if (!data) {
          return { allowed: false, reason: "not_entitled", featureCode };
        }
        return { allowed: true, reason: "entitled", featureCode };
      } catch {
        return { allowed: false, reason: "entitlement_error", featureCode };
      }
    },
  };
}
