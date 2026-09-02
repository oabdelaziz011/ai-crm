/** Sellable communication channel keys mapped to commercial feature_definitions.code. */
export const CHANNEL_KEY_TO_COMMERCIAL_FEATURE = Object.freeze({
  whatsapp: "whatsapp_channel",
  facebook: "facebook_channel",
  messenger: "facebook_channel",
  instagram: "instagram_channel",
  email: "email_channel",
  sms: "sms_channel",
} as const satisfies Record<string, string>);

export type SellableChannelKey = keyof typeof CHANNEL_KEY_TO_COMMERCIAL_FEATURE;

export type ChannelCommercialAccessReason =
  | "entitled"
  | "not_entitled"
  | "entitlement_unavailable"
  | "entitlement_error"
  | "not_applicable";

export type ChannelCommercialAccessDecision = {
  allowed: boolean;
  reason: ChannelCommercialAccessReason;
  featureCode: string | null;
};

/**
 * Fail-closed commercial entitlement gate for sellable communication channels.
 * Entitlement SoT: is_feature_enabled / company_feature_overrides (via host adapter).
 */
export type ChannelCommercialEntitlementPort = {
  checkAccess(input: {
    companyId: string;
    channelKey: string;
  }): Promise<ChannelCommercialAccessDecision>;
};

export function resolveChannelCommercialFeatureCode(
  channelKey: string | null | undefined,
): string | null {
  if (!channelKey?.trim()) return null;
  const normalized = channelKey.trim().toLowerCase();
  return (
    CHANNEL_KEY_TO_COMMERCIAL_FEATURE[
      normalized as SellableChannelKey
    ] ?? null
  );
}

export function isSellableChannelKey(channelKey: string | null | undefined): boolean {
  return resolveChannelCommercialFeatureCode(channelKey) != null;
}
