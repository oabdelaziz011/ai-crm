export type SmsProviderKind = "" | "twilio" | "infobip";

export type CompanySmsSettings = {
  companyId: string;
  enabled: boolean;
  provider: SmsProviderKind;
  accountSid: string;
  fromNumber: string;
  authToken: string;
  hasAuthToken: boolean;
  apiKey: string;
  hasApiKey: boolean;
  baseUrl: string;
  updatedAt?: string;
};

export type SmsSettingsDraft = Omit<
  CompanySmsSettings,
  "companyId" | "hasAuthToken" | "hasApiKey" | "updatedAt"
>;

export type SmsConnectionTestResponse = {
  ok: boolean;
  latencyMs: number;
  error?: string;
  reason?:
    | "ok"
    | "provider_missing"
    | "credentials_incomplete"
    | "settings_disabled"
    | "provider_auth_failed"
    | "provider_unreachable";
  provider: string;
  accountSid: string;
  fromNumber: string;
  accountName?: string;
};

export const DEFAULT_INFOBIP_BASE_URL = "https://api.infobip.com";
