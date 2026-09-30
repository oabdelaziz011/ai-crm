import type { SupabaseClient } from "@supabase/supabase-js";
import { ValidationError } from "../../errors.js";
import { assertChannelSettingsEnabled } from "../../webhooks/webhook-channel-guards.js";
import { SMS_CREDENTIALS_SOURCE } from "./twilio-sms-config.js";
import { normalizeInfobipBaseUrl } from "./infobip-sms-api-client.js";
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
  api_key?: string;
  base_url?: string;
};

function mapDecryptedSettings(row: DecryptedSettingsRow): TwilioSmsCredentials | null {
  const accountSid = String(row.account_sid ?? "").trim();
  const authToken = String(row.auth_token ?? "").trim();
  const fromNumber = String(row.from_number ?? "").trim();
  const apiKey = String(row.api_key ?? "").trim();
  const baseUrl = String(row.base_url ?? "").trim();
  const providerRaw = String(row.provider ?? "").trim() || "twilio";
  const provider = providerRaw === "infobip" ? "infobip" : "twilio";

  if (provider === "infobip") {
    if (!apiKey && !fromNumber && !baseUrl) return null;
    return {
      accountSid,
      authToken,
      fromNumber,
      apiKey,
      baseUrl: normalizeInfobipBaseUrl(baseUrl),
      enabled: row.enabled === true,
      provider: "infobip",
    };
  }

  if (!accountSid && !authToken && !fromNumber) return null;
  return {
    accountSid,
    authToken,
    fromNumber,
    apiKey,
    baseUrl,
    enabled: row.enabled === true,
    provider: "twilio",
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

  const provider =
    credentials?.provider === "infobip" || channelReferences.provider === "infobip"
      ? "infobip"
      : "twilio";

  if (provider === "infobip") {
    const apiKey = String(credentials?.apiKey ?? "").trim();
    if (!apiKey) {
      throw new ValidationError(
        "Infobip API key is not configured. Update company SMS settings.",
      );
    }
    const fromNumber =
      credentials?.fromNumber?.trim() || channelReferences.fromNumber?.trim() || "";
    if (!fromNumber) {
      throw new ValidationError("Infobip sender ID is not configured.");
    }
    const baseUrl = normalizeInfobipBaseUrl(
      credentials?.baseUrl || channelReferences.baseUrl || "",
    );
    return {
      accountSid: "",
      authToken: "",
      fromNumber,
      apiKey,
      baseUrl,
      enabled: credentials?.enabled,
      provider: "infobip",
    };
  }

  if (!credentials?.authToken.trim()) {
    throw new ValidationError(
      "SMS credentials are not configured. Update company SMS settings.",
    );
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
