import { useSmsSettings } from "@/hooks/channels/use-sms-settings";
import { resolveSmsConnectionStatus } from "@/lib/channels/sms-settings-status";
import { useAuth } from "@/context/auth-context";

export function useSmsControlCenter() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { data: settings, isLoading, isError } = useSmsSettings(companyId);
  const status = resolveSmsConnectionStatus(settings);
  const configured =
    Boolean(settings?.provider) &&
    Boolean(settings?.accountSid?.trim()) &&
    Boolean(settings?.fromNumber?.trim()) &&
    Boolean(settings?.hasAuthToken);

  return {
    isLoading,
    isError,
    settings,
    status: status.status,
    configured,
    enabled: settings?.enabled === true,
    provider: settings?.provider ?? "",
    fromNumber: settings?.fromNumber ?? "",
    needsSetup: !isLoading && (!configured || status.status === "not_connected"),
    /** Grouped view for workspace consumers that gate UI on readiness. */
    snapshot: {
      settingsLoaded: !isLoading && !isError,
      smsConfigured: configured && status.status === "connected",
      smsEnabled: settings?.enabled === true,
      status: status.status,
      provider: settings?.provider ?? "",
      fromNumber: settings?.fromNumber ?? "",
    },
  };
}
