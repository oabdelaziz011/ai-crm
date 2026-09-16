import type { TwilioSmsChannelReferences } from "./twilio-sms-types.js";

export const SMS_CREDENTIALS_SOURCE = "company_sms_settings" as const;

export function parseSmsChannelReferences(
  configuration: Record<string, unknown> | null | undefined,
): TwilioSmsChannelReferences {
  const cfg = configuration ?? {};
  return {
    accountSid: typeof cfg.accountSid === "string" ? cfg.accountSid : undefined,
    fromNumber: typeof cfg.fromNumber === "string" ? cfg.fromNumber : undefined,
    provider: typeof cfg.provider === "string" ? cfg.provider : undefined,
    credentialsSource: typeof cfg.credentialsSource === "string" ? cfg.credentialsSource : undefined,
  };
}

/**
 * Deterministic SMS thread id: remote party E.164 phone.
 * Twilio has no conversation SID for plain SMS — one phone ↔ one thread per company channel.
 */
export function buildSmsExternalThreadId(remotePhoneE164: string): string {
  return remotePhoneE164.trim();
}
