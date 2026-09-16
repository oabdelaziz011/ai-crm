import type { SupabaseClient } from "@supabase/supabase-js";
import { ValidationError } from "../../errors.js";
import { assertChannelSettingsEnabled } from "../../webhooks/webhook-channel-guards.js";
import { SMS_CREDENTIALS_SOURCE } from "./twilio-sms-config.js";
import type { TwilioSmsChannelReferences, TwilioSmsCredentials } from "./twilio-sms-types.js";

export { SMS_CREDENTIALS_SOURCE };

export type SmsCredentialsLoader = {
  loadByCompanyId(companyId: string): Promise<TwilioSmsCredentials | null>;
};

type DecryptedSettingsRow = {
  enabled?: boolean;
  provider?: string;
  account_sid?: string;
  from_number?: string;
  auth_token?: string;
};

function mapDecryptedSettings(row: DecryptedSettingsRow): TwilioSmsCredentials | null {
  const accountSid = String(row.account_sid ?? "").trim();
  const authToken = String(row.auth_token ?? "").trim();
  const fromNumber = String(row.from_number ?? "").trim();
  const provider = String(row.provider ?? "").trim() || "twilio";
  if (!accountSid && !authToken && !fromNumber) return null;
  return {
    accountSid,
    authToken,
    fromNumber,
    enabled: row.enabled === true,
    provider: provider === "twilio" ? "twilio" : "twilio",
  };
}

export async function loadCompanySmsCredentialsDecrypted(
  client: SupabaseClient,
  companyId: string,
): Promise<TwilioSmsCredentials | null> {
  const { data: decrypted, error } = await client.rpc("get_company_sms_settings_decrypted", {
    p_company_id: companyId,
  });
  if (error) {
    throw new ValidationError(`Failed to load SMS credentials: ${error.message}`);
  }
  if (!decrypted || typeof decrypted !== "object") return null;
  return mapDecryptedSettings(decrypted as DecryptedSettingsRow);
}

export function createSupabaseSmsCredentialsLoader(client: SupabaseClient): SmsCredentialsLoader {
  return {
    loadByCompanyId: (companyId) => loadCompanySmsCredentialsDecrypted(client, companyId),
  };
}

export async function resolveSmsRuntimeConfiguration(
  companyId: string,
  channelReferences: TwilioSmsChannelReferences,
  loader: SmsCredentialsLoader,
): Promise<TwilioSmsCredentials> {
  const credentials = await loader.loadByCompanyId(companyId);
  assertChannelSettingsEnabled(credentials, "SMS");

  if (!credentials?.authToken.trim()) {
    throw new ValidationError(
      "SMS credentials are not configured. Update company SMS settings.",
    );
  }
  if (credentials.provider !== "twilio") {
    throw new ValidationError("Only the Twilio SMS provider is supported.");
  }

  const accountSid =
    credentials.accountSid.trim() || channelReferences.accountSid?.trim() || "";
  const fromNumber =
    credentials.fromNumber.trim() || channelReferences.fromNumber?.trim() || "";

  if (!accountSid) {
    throw new ValidationError("SMS Account SID is not configured.");
  }
  if (!fromNumber) {
    throw new ValidationError("SMS sender number is not configured.");
  }

  return {
    accountSid,
    authToken: credentials.authToken.trim(),
    fromNumber,
    enabled: credentials.enabled,
    provider: "twilio",
  };
}
