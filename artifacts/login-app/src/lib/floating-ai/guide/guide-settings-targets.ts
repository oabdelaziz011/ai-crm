/**
 * Guide channel-connect destinations live under Settings, not the legacy
 * `/dashboard/whatsapp` redirect (Omnichannel) or the aggregated Channels page.
 */
export type GuideSettingsChannelId = "whatsapp" | "messenger" | "instagram";

export type GuideSettingsTarget = {
  id: GuideSettingsChannelId;
  /** Absolute dashboard path used with wouter setLocation / dashboardNestHref. */
  href: string;
  titleKey: string;
  /** Any of these RBAC codes authorizes opening the settings page for Guide. */
  anyOfPermissions: readonly string[];
  /** Billing feature_definitions.code — same as Settings route commercial gate. */
  commercialFeatureCode: string;
};

export const GUIDE_SETTINGS_CHANNEL_TARGETS: Readonly<
  Record<GuideSettingsChannelId, GuideSettingsTarget>
> = Object.freeze({
  whatsapp: {
    id: "whatsapp",
    href: "/dashboard/settings/whatsapp",
    titleKey: "dashboard.settings.nav.whatsapp",
    anyOfPermissions: ["settings.edit", "whatsapp.view", "ai.whatsapp.manage"],
    commercialFeatureCode: "whatsapp_channel",
  },
  messenger: {
    id: "messenger",
    href: "/dashboard/settings/messenger",
    titleKey: "dashboard.settings.nav.messenger",
    anyOfPermissions: ["settings.edit", "channels.view"],
    commercialFeatureCode: "facebook_channel",
  },
  instagram: {
    id: "instagram",
    href: "/dashboard/settings/instagram",
    titleKey: "dashboard.settings.nav.instagram",
    anyOfPermissions: ["settings.edit", "channels.view"],
    commercialFeatureCode: "instagram_channel",
  },
});

/** Logical Guide route ids that must open Settings channel pages (never Omnichannel / Channels hub). */
export const GUIDE_SETTINGS_ROUTE_ALIASES: Readonly<Record<string, GuideSettingsChannelId>> =
  Object.freeze({
    "settings.whatsapp": "whatsapp",
    "settings.messenger": "messenger",
    "settings.instagram": "instagram",
    whatsapp_settings: "whatsapp",
    messenger_settings: "messenger",
    instagram_settings: "instagram",
    // Legacy dashboard ids — Guide walkthroughs still emit these; remap to Settings.
    whatsapp: "whatsapp",
    messenger: "messenger",
    instagram: "instagram",
  });

export function resolveGuideSettingsChannelId(
  routeIdOrAlias: string,
): GuideSettingsChannelId | null {
  const key = String(routeIdOrAlias ?? "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  return GUIDE_SETTINGS_ROUTE_ALIASES[key] ?? null;
}

export function resolveGuideSettingsTargetFromPath(
  nestedOrAbsolutePath: string,
): GuideSettingsTarget | null {
  const raw = String(nestedOrAbsolutePath ?? "").trim().toLowerCase();
  if (!raw) return null;
  const normalized = raw.replace(/^~/, "");
  for (const target of Object.values(GUIDE_SETTINGS_CHANNEL_TARGETS)) {
    const abs = target.href.toLowerCase();
    const nest = abs.replace(/^\/dashboard/, "") || abs;
    if (
      normalized === abs ||
      normalized === nest ||
      normalized.endsWith(nest) ||
      normalized.includes(`/settings/${target.id}`)
    ) {
      return target;
    }
  }
  return null;
}
