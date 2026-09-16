import type { SupabaseClient } from "@supabase/supabase-js";
import { hasCompanyFeature } from "@/lib/billing/company-feature-entitlement-service";
import {
  hasWhatsAppOutboundPhoneCandidate,
  resolveWhatsAppOutboundPhone,
  type CustomerOutboundPhoneFields,
} from "@/lib/notifications/providers/whatsapp/services/whatsapp-outbound-phone";
import type { CampaignFeatureEntitlementPort } from "./meta-messaging-capability";

export const SMS_CAMPAIGN_FEATURE_CODE = "sms_channel" as const;

export type SmsCampaignCapabilityResult = {
  available: boolean;
  reason:
    | "ok"
    | "not_entitled"
    | "channel_disabled_or_missing"
    | "settings_disabled"
    | "credentials_incomplete";
  companyChannelId: string | null;
  featureCode: typeof SMS_CAMPAIGN_FEATURE_CODE;
};

type CompanyChannelRow = {
  id: string;
  is_enabled: boolean | null;
  deleted_at: string | null;
  communication_channels?: { key?: string } | { key?: string }[] | null;
};

type SmsSettingsPublic = {
  enabled?: boolean;
  provider?: string;
  account_sid?: string;
  from_number?: string;
  has_auth_token?: boolean;
};

function channelKey(row: CompanyChannelRow): string {
  const embedded = row.communication_channels;
  if (Array.isArray(embedded)) return embedded[0]?.key ?? "";
  return embedded?.key ?? "";
}

/** Same phone identity as WhatsApp outbound — SMS does not invent a second number. */
export function hasCampaignOutboundSms(customer: CustomerOutboundPhoneFields): boolean {
  return hasWhatsAppOutboundPhoneCandidate(customer);
}

export function resolveCampaignOutboundSms(customer: CustomerOutboundPhoneFields):
  | { ok: true; phone: string }
  | { ok: false; reason: "missing_phone" | "phone_identity_unresolved" | "invalid_phone_identity" } {
  const outbound = resolveWhatsAppOutboundPhone(customer);
  if (!outbound.ok) {
    return { ok: false, reason: outbound.reason };
  }
  return { ok: true, phone: outbound.phone };
}

/**
 * SMS campaign availability: commercial sms_channel entitlement + settings/channel state.
 * Missing SMS company_channels row is allowed when entitled and settings are enabled.
 * Explicit disabled company_channels row or disabled settings blocks outbound.
 */
export class SmsCampaignCapabilityChecker {
  constructor(
    private readonly client: SupabaseClient,
    private readonly entitlement: CampaignFeatureEntitlementPort = {
      isEnabled: (companyId, featureCode) => hasCompanyFeature(companyId, featureCode, client),
    },
  ) {}

  async check(companyId: string): Promise<SmsCampaignCapabilityResult> {
    const featureCode = SMS_CAMPAIGN_FEATURE_CODE;
    const entitled = await this.entitlement.isEnabled(companyId, featureCode);
    if (!entitled) {
      return {
        available: false,
        reason: "not_entitled",
        companyChannelId: null,
        featureCode,
      };
    }

    const { data, error } = await this.client
      .from("company_channels")
      .select("id, is_enabled, deleted_at, communication_channels(key)")
      .eq("company_id", companyId)
      .is("deleted_at", null);

    if (error) throw new Error(error.message);

    const smsChannels = ((data as CompanyChannelRow[] | null) ?? []).filter(
      (row) => channelKey(row) === "sms",
    );
    const enabled = smsChannels.filter((row) => row.is_enabled === true);

    if (smsChannels.length > 0 && enabled.length === 0) {
      return {
        available: false,
        reason: "channel_disabled_or_missing",
        companyChannelId: smsChannels[0]?.id ?? null,
        featureCode,
      };
    }

    const { data: settingsData, error: settingsError } = await this.client.rpc(
      "get_company_sms_settings",
      { p_company_id: companyId },
    );
    if (settingsError) throw new Error(settingsError.message);

    const settings = (settingsData ?? {}) as SmsSettingsPublic;
    if (settings.enabled !== true) {
      return {
        available: false,
        reason: "settings_disabled",
        companyChannelId: enabled[0]?.id ?? null,
        featureCode,
      };
    }

    const providerOk = String(settings.provider ?? "").trim() === "twilio";
    const accountOk = String(settings.account_sid ?? "").trim().length > 0;
    const fromOk = String(settings.from_number ?? "").trim().length > 0;
    const tokenOk = settings.has_auth_token === true;
    if (!providerOk || !accountOk || !fromOk || !tokenOk) {
      return {
        available: false,
        reason: "credentials_incomplete",
        companyChannelId: enabled[0]?.id ?? null,
        featureCode,
      };
    }

    return {
      available: true,
      reason: "ok",
      companyChannelId: enabled[0]?.id ?? null,
      featureCode,
    };
  }
}
