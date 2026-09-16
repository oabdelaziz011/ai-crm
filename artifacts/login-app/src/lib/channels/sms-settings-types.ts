export type SmsProviderKind = "" | "twilio";

export type CompanySmsSettings = {
  companyId: string;
  enabled: boolean;
  provider: SmsProviderKind;
  accountSid: string;
  fromNumber: string;
  authToken: string;
  hasAuthToken: boolean;
  updatedAt?: string;
};

export type SmsSettingsDraft = Omit<
  CompanySmsSettings,
  "companyId" | "hasAuthToken" | "updatedAt"
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
