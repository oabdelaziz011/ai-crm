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

/**
 * Dev/test-only payload. Production must never enable this bypass.
 * `to` must be canonical E.164 (+…) — never a raw local number.
 */
export const WHATSAPP_DIRECT_OUTBOUND_BYPASS_PAYLOAD: WhatsAppSendMessagePayload = {
  messaging_product: "whatsapp",
  recipient_type: "individual",
  to: "+201023169075",
  type: "text",
  text: {
    body: "ValueOR direct test",
  },
};

const E164_TO_PATTERN = /^\+[1-9][0-9]{7,14}$/;

/**
 * Direct Meta outbound bypass is forbidden in production.
 * Requires explicit WHATSAPP_DIRECT_OUTBOUND_BYPASS=true AND non-production env.
 */
export function isWhatsAppDirectOutboundBypassAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.WHATSAPP_DIRECT_OUTBOUND_BYPASS !== "true") return false;
  const nodeEnv = String(env.NODE_ENV ?? "").trim().toLowerCase();
  const appEnv = String(env.VALUEOR_ENV ?? env.APP_ENV ?? env.ENVIRONMENT ?? "")
    .trim()
    .toLowerCase();
  if (nodeEnv === "production" || nodeEnv === "prod") return false;
  if (appEnv === "production" || appEnv === "prod") return false;
  return true;
}

/** Validate bypass destination is canonical E.164 (no raw locals). */
export function assertWhatsAppDirectOutboundBypassPayload(
  payload: WhatsAppSendMessagePayload = WHATSAPP_DIRECT_OUTBOUND_BYPASS_PAYLOAD,
): void {
  const to = String(payload.to ?? "").trim();
  if (!E164_TO_PATTERN.test(to)) {
    throw new Error(
      "WHATSAPP_DIRECT_OUTBOUND_BYPASS requires canonical E.164 destination (leading +).",
    );
  }
}

export async function sendWhatsAppDirectOutboundBypass(input: {
  companyId: string;
  companyChannelConfiguration: Record<string, unknown>;
  credentialsLoader: WhatsAppCredentialsLoader;
}): Promise<Record<string, unknown>> {
  if (!isWhatsAppDirectOutboundBypassAllowed()) {
    throw new Error(
      "WHATSAPP_DIRECT_OUTBOUND_BYPASS is disabled in production and when the flag is unset.",
    );
  }
  assertWhatsAppDirectOutboundBypassPayload(WHATSAPP_DIRECT_OUTBOUND_BYPASS_PAYLOAD);

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
