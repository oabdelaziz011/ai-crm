import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";
import { isEmailNavRouteVisible } from "@/lib/email-routing/email-nav-visibility";
import {
  EMAIL_ROUTING_TAB_PERMISSION,
  EMAIL_TEMPLATES_TAB_PERMISSION,
} from "@/lib/email-workspace/email-tab-permissions";

export const EMAIL_BASE_NESTED_PATH = "/email";

export type EmailRouteId =
  | "inbox"
  | "sent"
  | "drafts"
  | "templates"
  | "ai-routing";

export type EmailRouteDefinition = {
  id: EmailRouteId;
  nestedPath: string;
  titleKey: string;
  /** RBAC permission for the nested route (module shell already requires email.view). */
  permission?: string;
  /** When set, route is hidden unless commercial entitlement is true. */
  commercialFeatureCode?: string;
  Page: LazyExoticComponent<ComponentType>;
};

const lazyNamed = <T extends ComponentType>(
  loader: () => Promise<Record<string, T>>,
  exportName: string,
) =>
  lazy(() =>
    loader().then((module) => ({
      default: module[exportName],
    })),
  );

export const EMAIL_ROUTE_REGISTRY: readonly EmailRouteDefinition[] = [
  {
    id: "inbox",
    nestedPath: "/",
    titleKey: "emailModule.nav.inbox",
    Page: lazyNamed(
      () => import("@/pages/dashboard/email/email-inbox-page"),
      "EmailInboxPage",
    ),
  },
  {
    id: "sent",
    nestedPath: "/sent",
    titleKey: "emailModule.nav.sent",
    Page: lazyNamed(
      () => import("@/pages/dashboard/email/email-sent-page"),
      "EmailSentPage",
    ),
  },
  {
    id: "drafts",
    nestedPath: "/drafts",
    titleKey: "emailModule.nav.drafts",
    Page: lazyNamed(
      () => import("@/pages/dashboard/email/email-drafts-page"),
      "EmailDraftsPage",
    ),
  },
  {
    id: "templates",
    nestedPath: "/templates",
    titleKey: "emailModule.nav.templates",
    permission: EMAIL_TEMPLATES_TAB_PERMISSION,
    Page: lazyNamed(
      () => import("@/pages/dashboard/email/email-templates-page"),
      "EmailTemplatesPage",
    ),
  },
  {
    id: "ai-routing",
    nestedPath: "/ai-routing",
    titleKey: "emailModule.nav.aiRouting",
    permission: EMAIL_ROUTING_TAB_PERMISSION,
    commercialFeatureCode: "ai_email_routing",
    Page: lazyNamed(
      () => import("@/pages/dashboard/email/email-ai-routing-page"),
      "EmailAiRoutingPage",
    ),
  },
] as const;

export const EMAIL_DEFAULT_NESTED_PATH = "/";

export function emailNavItems(
  commercialFeatureEnabled?: (featureCode: string) => boolean | undefined,
  auth?: {
    hasPermission?: (code: string) => boolean;
    isSuperAdmin?: boolean;
  },
): readonly EmailRouteDefinition[] {
  return EMAIL_ROUTE_REGISTRY.filter((route) =>
    isEmailNavRouteVisible(route, commercialFeatureEnabled, auth),
  );
}
