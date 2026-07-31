import { WhatsAppApiClient } from "./whatsapp-api-client.js";
import { parseWhatsAppChannelReferences } from "./whatsapp-config.js";
import { resolveWhatsAppRuntimeConfiguration } from "./whatsapp-canonical-credentials.js";
import type { WhatsAppCredentialsLoader } from "./whatsapp-canonical-credentials.js";
import type { WhatsAppSendMessagePayload } from "./whatsapp-types.js";

export type WhatsAppDirectOutboundBypassOptions = {
  enabled: boolean;
  credentialsLoader: WhatsAppCredentialsLoader;
  onResponse?: (detail: Record<string, unknown>) => void;
};

/** Temporary test payload — remove when bypass is disabled. */
export const WHATSAPP_DIRECT_OUTBOUND_BYPASS_PAYLOAD: WhatsAppSendMessagePayload = {
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to: "201023169075",
  type: "text",
  text: {
    body: "ValueOR direct test",
  },
};

export async function sendWhatsAppDirectOutboundBypass(input: {
  companyId: string;
  companyChannelConfiguration: Record<string, unknown>;
  credentialsLoader: WhatsAppCredentialsLoader;
}): Promise<Record<string, unknown>> {
  const channelReferences = parseWhatsAppChannelReferences(input.companyChannelConfiguration);
  const runtimeConfig = await resolveWhatsAppRuntimeConfiguration(
    input.companyId,
    channelReferences,
    input.credentialsLoader,
  );

  const apiClient = new WhatsAppApiClient();
  const response = await apiClient.sendMessage(
    runtimeConfig,
    WHATSAPP_DIRECT_OUTBOUND_BYPASS_PAYLOAD,
    { accessTokenSource: "company_whatsapp_settings" },
  );

  return response as unknown as Record<string, unknown>;
}
