import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WHATSAPP_CHANNEL_FEATURE_CODE,
  type WhatsAppMessagesCommercialPort,
} from "@workspace/channel-platform";
import { isCompanyFeatureEnabled } from "@/lib/billing/require-company-feature";

/**
 * Fail-closed WhatsApp commercial gate for login-app / local queue paths.
 * Entitlement SoT: is_feature_enabled / whatsapp_channel.
 * Does not call Meta. Quota metering is handled by api-server adapter when used there.
 */
export function createLoginAppWhatsAppMessagesCommercialPort(
  client: SupabaseClient,
): WhatsAppMessagesCommercialPort {
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
          WHATSAPP_CHANNEL_FEATURE_CODE,
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
      // Usage metering is owned by api-server process-queue path.
      return { recorded: false, reason: "login_app_local_path" };
    },
  };
}
