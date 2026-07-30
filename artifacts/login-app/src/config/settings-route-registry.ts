import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";

export const SETTINGS_BASE_NESTED_PATH = "/settings";

export type SettingsRouteId =
  | "personal-profile"
  | "account-information"
  | "company-settings"
  | "security"
  | "notifications"
  | "email"
  | "whatsapp"
  | "messenger"
  | "instagram"
  | "scheduling"
  | "platform-ai";

export type SettingsRouteDefinition = {
  id: SettingsRouteId;
  nestedPath: string;
  titleKey: string;
  permission?: string;
  /** Restrict to platform super administrators (future: platform_ai.manage). */
  superAdminOnly?: boolean;
  Page: LazyExoticComponent<ComponentType>;
};

function MissingSettingsPageExport() {
  return null;
}

const lazyNamed = <T extends ComponentType>(
  loader: () => Promise<Record<string, T>>,
  exportName: string,
) =>
  lazy(() =>
    loader().then((module) => ({
      default: module[exportName] ?? (MissingSettingsPageExport as ComponentType),
    })),
  );

export const SETTINGS_ROUTE_REGISTRY: readonly SettingsRouteDefinition[] = [
  {
    id: "personal-profile",
    nestedPath: "/profile",
    titleKey: "dashboard.settings.nav.personalProfile",
    permission: "settings.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/personal-profile-page"),
      "SettingsPersonalProfilePage",
    ),
  },
  {
    id: "account-information",
    nestedPath: "/account",
    titleKey: "dashboard.settings.nav.accountInformation",
    permission: "settings.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/account-information-page"),
      "SettingsAccountInformationPage",
    ),
  },
  {
    id: "company-settings",
    nestedPath: "/company",
    titleKey: "dashboard.settings.nav.companySettings",
    permission: "settings.edit",
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/company-settings-page"),
      "SettingsCompanySettingsPage",
    ),
  },
  {
    id: "security",
    nestedPath: "/security",
    titleKey: "dashboard.settings.nav.security",
    permission: "settings.view",
    Page: lazyNamed(() => import("@/pages/dashboard/settings/security-page"), "SettingsSecurityPage"),
  },
  {
    id: "notifications",
    nestedPath: "/notifications",
    titleKey: "dashboard.settings.nav.notifications",
    permission: "settings.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/notifications-page"),
      "SettingsNotificationsPage",
    ),
  },
  {
    id: "email",
    nestedPath: "/email",
    titleKey: "dashboard.settings.nav.email",
    permission: "settings.edit",
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/email-settings-page"),
      "SettingsEmailPage",
    ),
  },
  {
    id: "whatsapp",
    nestedPath: "/whatsapp",
    titleKey: "dashboard.settings.nav.whatsapp",
    permission: "settings.edit",
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/whatsapp-settings-page"),
      "SettingsWhatsAppPage",
    ),
  },
  {
    id: "messenger",
    nestedPath: "/messenger",
    titleKey: "dashboard.settings.nav.messenger",
    permission: "settings.edit",
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/messenger-settings-page"),
      "SettingsMessengerPage",
    ),
  },
  {
    id: "instagram",
    nestedPath: "/instagram",
    titleKey: "dashboard.settings.nav.instagram",
    permission: "settings.edit",
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/instagram-settings-page"),
      "SettingsInstagramPage",
    ),
  },
  {
    id: "scheduling",
    nestedPath: "/scheduling",
    titleKey: "dashboard.settings.nav.scheduling",
    permission: "scheduling.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/scheduling-page"),
      "SettingsSchedulingPage",
    ),
  },
  {
    id: "platform-ai",
    nestedPath: "/platform-ai",
    titleKey: "dashboard.settings.nav.platformAi",
    superAdminOnly: true,
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/platform-ai-settings-page"),
      "SettingsPlatformAiPage",
    ),
  },
] as const;

export const SETTINGS_DEFAULT_NESTED_PATH = "/profile";

export function settingsNavItems(): readonly SettingsRouteDefinition[] {
  return SETTINGS_ROUTE_REGISTRY;
}
