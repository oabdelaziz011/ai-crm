import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EMAIL_CHANNEL_FEATURE_CODE,
  type EmailsSentCommercialPort,
} from "@workspace/channel-platform";
import { isCompanyFeatureEnabled } from "@/lib/billing/require-company-feature";

/**
 * Fail-closed email commercial gate for login-app / local queue paths.
 * Entitlement SoT: is_feature_enabled / email_channel.
 * Quota metering is handled by api-server adapter when used there.
 */
export function createLoginAppEmailsSentCommercialPort(
  client: SupabaseClient,
): EmailsSentCommercialPort {
  return {
    async checkAccess(input) {
      const companyId = input.companyId?.trim();
      if (!companyId) {
        return { allowed: false, reason: "entitlement_unavailable" };
      }
      try {
        const enabled = await isCompanyFeatureEnabled(
          client,
          companyId,
          EMAIL_CHANNEL_FEATURE_CODE,
        );
        if (!enabled) {
          return { allowed: false, reason: "not_entitled" };
        }
        return { allowed: true, reason: "entitled" };
      } catch {
        return { allowed: false, reason: "entitlement_error" };
      }
    },

    async recordUsage() {
      return { recorded: false, reason: "login_app_local_path" };
    },
  };
}
