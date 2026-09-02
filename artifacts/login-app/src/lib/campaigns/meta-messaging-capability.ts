import type { SupabaseClient } from "@supabase/supabase-js";
import { hasCompanyFeature } from "@/lib/billing/company-feature-entitlement-service";
import type { MetaMessagingChannelKey } from "./thread-eligibility";

export type MetaMessagingCapabilityResult = {
  available: boolean;
  reason:
    | "ok"
    | "channel_disabled_or_missing"
    | "settings_disabled"
    | "credentials_incomplete"
    | "not_entitled";
  companyChannelId: string | null;
  featureCode: string;
};

type CompanyChannelRow = {
  id: string;
  is_enabled: boolean | null;
  deleted_at: string | null;
  communication_channels?: { key?: string } | { key?: string }[] | null;
};

function channelKey(row: CompanyChannelRow): string {
  const embedded = row.communication_channels;
  if (Array.isArray(embedded)) return embedded[0]?.key ?? "";
  return embedded?.key ?? "";
}

export type CampaignFeatureEntitlementPort = {
  isEnabled(companyId: string, featureCode: string): Promise<boolean>;
};

const FEATURE_BY_CHANNEL: Record<MetaMessagingChannelKey, string> = {
  instagram: "channel.instagram",
  messenger: "channel.facebook",
};

/**
 * Company-level IG/Messenger availability from existing channel + settings + entitlement.
 * Does not call Meta health endpoints (no real network in campaign domain).
 */
export class MetaMessagingCampaignCapabilityChecker {
  constructor(
    private readonly client: SupabaseClient,
    private readonly entitlement: CampaignFeatureEntitlementPort = {
      isEnabled: (companyId, featureCode) => hasCompanyFeature(companyId, featureCode, client),
    },
  ) {}

  async check(
    companyId: string,
    channel: MetaMessagingChannelKey,
  ): Promise<MetaMessagingCapabilityResult> {
    const featureCode = FEATURE_BY_CHANNEL[channel];
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
      .is("deleted_at", null)
      .eq("is_enabled", true);

    if (error) throw new Error(error.message);

    const matching = ((data as CompanyChannelRow[] | null) ?? []).filter(
      (row) => channelKey(row) === channel,
    );
    if (matching.length === 0) {
      return {
        available: false,
        reason: "channel_disabled_or_missing",
        companyChannelId: null,
        featureCode,
      };
    }

    const settings = await this.loadSettings(companyId, channel);
    if (!settings.enabled) {
      return {
        available: false,
        reason: "settings_disabled",
        companyChannelId: matching[0]?.id ?? null,
        featureCode,
      };
    }
    if (!settings.hasAccessToken || !settings.accountId.trim()) {
      return {
        available: false,
        reason: "credentials_incomplete",
        companyChannelId: matching[0]?.id ?? null,
        featureCode,
      };
    }

    return {
      available: true,
      reason: "ok",
      companyChannelId: matching[0]?.id ?? null,
      featureCode,
    };
  }

  private async loadSettings(
    companyId: string,
    channel: MetaMessagingChannelKey,
  ): Promise<{ enabled: boolean; hasAccessToken: boolean; accountId: string }> {
    if (channel === "instagram") {
      const { data, error } = await this.client.rpc("get_company_instagram_settings", {
        p_company_id: companyId,
      });
      if (error) throw new Error(error.message);
      const row = (data ?? {}) as Record<string, unknown>;
      return {
        enabled: Boolean(row.enabled),
        hasAccessToken: Boolean(row.has_access_token),
        accountId: String(row.instagram_business_account_id ?? row.page_id ?? ""),
      };
    }

    const { data, error } = await this.client.rpc("get_company_messenger_settings", {
      p_company_id: companyId,
    });
    if (error) throw new Error(error.message);
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      enabled: Boolean(row.enabled),
      hasAccessToken: Boolean(row.has_access_token),
      accountId: String(row.page_id ?? ""),
    };
  }
}
