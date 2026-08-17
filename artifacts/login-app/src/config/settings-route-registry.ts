import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";
import { isSettingsRoutePermitted } from "@/lib/settings/settings-permissions";

export const SETTINGS_BASE_NESTED_PATH = "/settings";

export type SettingsRouteId =
  | "personal-profile"
  | "appearance"
  | "account-information"
  | "security"
  | "notifications"
  | "email"
  | "whatsapp"
  | "messenger"
  | "instagram"
  | "calendar"
  | "scheduling"
  | "ticket-sla"
  | "platform-ai";

export type SettingsRouteDefinition = {
  id: SettingsRouteId;
  nestedPath: string;
  titleKey: string;
  permission?: string;
  /** Restrict to platform super administrators (future: platform_ai.manage). */
  superAdminOnly?: boolean;
  /**
   * Commercial entitlement required in addition to RBAC.
   * Uses existing billing feature_definitions.code values only.
   */
  commercialFeatureCode?: string;
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
    id: "appearance",
    nestedPath: "/appearance",
    titleKey: "dashboard.settings.nav.appearance",
    permission: "settings.view",
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/appearance-page"),
      "SettingsAppearancePage",
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
    commercialFeatureCode: "email_channel",
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
    commercialFeatureCode: "whatsapp_channel",
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
    commercialFeatureCode: "facebook_channel",
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
    commercialFeatureCode: "instagram_channel",
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/instagram-settings-page"),
      "SettingsInstagramPage",
    ),
  },
  {
    id: "calendar",
    nestedPath: "/calendar",
    titleKey: "dashboard.settings.nav.calendar",
    permission: "bookings.view",
    // Same commercial code as dashboard Calendar / Bookings / Scheduling routes.
    commercialFeatureCode: "bookings",
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/settings-calendar-page"),
      "SettingsCalendarPage",
    ),
  },
  {
    id: "scheduling",
    nestedPath: "/scheduling",
    titleKey: "dashboard.settings.nav.scheduling",
    permission: "scheduling.view",
    commercialFeatureCode: "bookings",
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/scheduling-page"),
      "SettingsSchedulingPage",
    ),
  },
  {
    id: "ticket-sla",
    nestedPath: "/tickets/sla",
    titleKey: "dashboard.settings.nav.ticketSla",
    permission: "tickets.manage",
    // SLA is part of the ticketing commercial module (no separate SLA feature code).
    commercialFeatureCode: "ticketing",
    Page: lazyNamed(
      () => import("@/pages/dashboard/settings/ticket-sla-settings-page"),
      "SettingsTicketSlaPage",
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

/** Settings sub-nav items filtered by RBAC + commercial entitlement. */
export function settingsNavItems(
  hasPermission: (code: string) => boolean = () => false,
  isSuperAdmin = false,
  commercialFeatureEnabled?: (featureCode: string) => boolean | undefined,
): readonly SettingsRouteDefinition[] {
  return SETTINGS_ROUTE_REGISTRY.filter((route) =>
    isSettingsRoutePermitted(route, hasPermission, isSuperAdmin, commercialFeatureEnabled),
  );
}
