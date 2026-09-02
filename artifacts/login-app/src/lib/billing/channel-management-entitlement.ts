export type CommercialFeatureEnabledLookup = (featureCode: string) => boolean | undefined;

/**
 * Sellable channel SKUs that unlock the Channels management dashboard.
 * Excludes omnichannel (inbox-only) and sms (no management UI/transport).
 */
export const CHANNEL_MANAGEMENT_ENTITLEMENT_CODES = [
  "whatsapp_channel",
  "facebook_channel",
  "instagram_channel",
  "email_channel",
] as const;

export type ChannelManagementEntitlementCode =
  (typeof CHANNEL_MANAGEMENT_ENTITLEMENT_CODES)[number];

/** Channel catalog keys with an active management surface (excludes SMS stub). */
export const CHANNEL_MANAGEMENT_UI_CHANNEL_KEYS = new Set([
  "whatsapp",
  "messenger",
  "facebook",
  "instagram",
  "email",
  "web_chat",
]);

/**
 * Fail-closed: true only when at least one management channel SKU is entitled.
 * undefined/loading/error → false. Omnichannel alone does not pass.
 */
export function isAnyChannelManagementEntitled(
  commercialFeatureEnabled?: CommercialFeatureEnabledLookup,
): boolean {
  if (!commercialFeatureEnabled) return false;
  return CHANNEL_MANAGEMENT_ENTITLEMENT_CODES.some(
    (code) => commercialFeatureEnabled(code) === true,
  );
}

export function isChannelManagementUiSupported(channelKey: string | undefined): boolean {
  if (!channelKey?.trim()) return false;
  return CHANNEL_MANAGEMENT_UI_CHANNEL_KEYS.has(channelKey.trim().toLowerCase());
}
