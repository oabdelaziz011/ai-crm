import type { SupabaseClient } from "@supabase/supabase-js";
import { hasCompanyFeature } from "@/lib/billing/company-feature-entitlement-service";
import { WhatsAppSettingsRepository } from "@/lib/notifications/providers/whatsapp/services/whatsapp-settings-repository";
import type { CampaignFeatureEntitlementPort } from "./meta-messaging-capability";

export const WHATSAPP_CAMPAIGN_FEATURE_CODE = "whatsapp_channel" as const;

export type WhatsAppCampaignCapabilityResult = {
  available: boolean;
  reason:
    | "ok"
    | "not_entitled"
    | "channel_disabled_or_missing"
    | "settings_disabled"
    | "credentials_incomplete"
    | "token_invalid";
  companyChannelId: string | null;
  featureCode: typeof WHATSAPP_CAMPAIGN_FEATURE_CODE;
};

type CompanyChannelRow = {
  id: string;
  is_enabled: boolean | null;
  deleted_at: string | null;
  status?: string | null;
  communication_channels?: { key?: string } | { key?: string }[] | null;
};

function channelKey(row: CompanyChannelRow): string {
  const embedded = row.communication_channels;
  if (Array.isArray(embedded)) return embedded[0]?.key ?? "";
  return embedded?.key ?? "";
}

/**
 * Resolves WhatsApp campaign availability:
 * whatsapp_channel commercial entitlement AND channel/settings config.
 * Does not call Meta.
 */
export class WhatsAppCampaignCapabilityChecker {
  private readonly settingsRepo: WhatsAppSettingsRepository;

  constructor(
    private readonly client: SupabaseClient,
    private readonly entitlement: CampaignFeatureEntitlementPort = {
      isEnabled: (companyId, featureCode) => hasCompanyFeature(companyId, featureCode, client),
    },
  ) {
    this.settingsRepo = new WhatsAppSettingsRepository(client);
  }

  async check(companyId: string): Promise<WhatsAppCampaignCapabilityResult> {
    const featureCode = WHATSAPP_CAMPAIGN_FEATURE_CODE;
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
      .select("id, is_enabled, deleted_at, status, communication_channels(key)")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .eq("is_enabled", true);

    if (error) throw new Error(error.message);

    const whatsappChannels = ((data as CompanyChannelRow[] | null) ?? []).filter(
      (row) => channelKey(row) === "whatsapp",
    );

    if (whatsappChannels.length === 0) {
      return {
        available: false,
        reason: "channel_disabled_or_missing",
        companyChannelId: null,
        featureCode,
      };
    }

    const settings = await this.settingsRepo.getPublic(companyId);
    if (!settings.enabled) {
      return {
        available: false,
        reason: "settings_disabled",
        companyChannelId: whatsappChannels[0]?.id ?? null,
        featureCode,
      };
    }

    if (!settings.hasAccessToken || !settings.phoneNumberId.trim()) {
      return {
        available: false,
        reason: "credentials_incomplete",
        companyChannelId: whatsappChannels[0]?.id ?? null,
        featureCode,
      };
    }

    if (settings.tokenStatus === "invalid" || settings.tokenStatus === "expired") {
      return {
        available: false,
        reason: "token_invalid",
        companyChannelId: whatsappChannels[0]?.id ?? null,
        featureCode,
      };
    }

    return {
      available: true,
      reason: "ok",
      companyChannelId: whatsappChannels[0]?.id ?? null,
      featureCode,
    };
  }
}
