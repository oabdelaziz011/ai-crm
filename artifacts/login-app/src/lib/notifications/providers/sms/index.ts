import type { SupabaseClient } from "@supabase/supabase-js";
import { createSmsProvider } from "@/lib/notifications/providers/sms/services/sms-provider";
import { TwilioSmsTransport } from "@/lib/notifications/providers/sms/adapter/twilio-sms-transport";

export { createSmsProvider } from "@/lib/notifications/providers/sms/services/sms-provider";
export { TwilioSmsTransport } from "@/lib/notifications/providers/sms/adapter/twilio-sms-transport";
export {
  buildSmsOutboundBody,
  resolveSmsOutboundPhone,
} from "@/lib/notifications/providers/sms/services/sms-provider";
export { processSmsQueue, isSmsApiConfigured } from "@/lib/notifications/providers/sms/services/sms-api-client";

export function createSmsProviderServices(client: SupabaseClient) {
  return {
    provider: createSmsProvider(client, { twilio: new TwilioSmsTransport() }),
  };
}
