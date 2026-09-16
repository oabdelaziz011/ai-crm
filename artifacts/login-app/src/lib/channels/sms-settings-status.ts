import type { CompanySmsSettings } from "./sms-settings-types";

export type { CompanySmsSettings, SmsProviderKind, SmsSettingsDraft } from "./sms-settings-types";

/** Connection status for settings card — never invents Connected without credentials. */
export function resolveSmsConnectionStatus(settings: CompanySmsSettings | null | undefined): {
  status: "connected" | "not_connected" | "disabled";
  provider: string;
  fromNumber: string;
} {
  if (!settings) {
    return { status: "not_connected", provider: "", fromNumber: "" };
  }
  if (!settings.enabled) {
    return {
      status: "disabled",
      provider: settings.provider,
      fromNumber: settings.fromNumber,
    };
  }
  const configured =
    settings.provider === "twilio" &&
    settings.accountSid.trim().length > 0 &&
    settings.fromNumber.trim().length > 0 &&
    settings.hasAuthToken;
  return {
    status: configured ? "connected" : "not_connected",
    provider: settings.provider,
    fromNumber: settings.fromNumber,
  };
}
