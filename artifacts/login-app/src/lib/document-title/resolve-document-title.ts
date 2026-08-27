import { DASHBOARD_BASE_PATH, sectionIdFromNestedPath } from "@/config/dashboard-route-registry";
import { isDashboardHomeNestedPath } from "@/lib/dashboard-home";
import { resolveDashboardBreadcrumbs } from "@/lib/routing/breadcrumb-resolver";
import { formatDocumentTitle } from "./format-document-title";

export type DocumentTitleTranslate = (
  key: string,
  options?: { defaultValue?: string },
) => string;

type StaticTitleRule = {
  match: (pathname: string) => boolean;
  titleKey: string;
};

const STATIC_TITLE_RULES: readonly StaticTitleRule[] = [
  { match: (path) => path === "/login", titleKey: "documentTitle.login" },
  { match: (path) => path === "/register", titleKey: "documentTitle.register" },
  { match: (path) => path === "/forgot-password", titleKey: "documentTitle.forgotPassword" },
  { match: (path) => path === "/reset-password", titleKey: "documentTitle.resetPassword" },
  { match: (path) => path === "/auth/callback", titleKey: "documentTitle.authCallback" },
  { match: (path) => path === "/debug/workflow-builder", titleKey: "documentTitle.workflowDebug" },
  { match: (path) => /^\/book\/[^/]+\/flow$/.test(path), titleKey: "documentTitle.bookingFlow" },
  { match: (path) => /^\/book\/[^/]+$/.test(path), titleKey: "documentTitle.booking" },
  { match: (path) => /^\/portal\/[^/]+\/login$/.test(path), titleKey: "documentTitle.portalLogin" },
  { match: (path) => /^\/portal\/[^/]+/.test(path), titleKey: "documentTitle.portal" },
  { match: (path) => /^\/check-in\/[^/]+$/.test(path), titleKey: "documentTitle.checkIn" },
];

function normalizePathname(pathname: string): string {
  if (!pathname) return "/";
  const withoutQuery = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.replace(/\/+$/, "") || "/";
  }
  return withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
}

function dashboardNestedPath(absolutePath: string): string {
  if (absolutePath === DASHBOARD_BASE_PATH) return "/";
  if (absolutePath.startsWith(`${DASHBOARD_BASE_PATH}/`)) {
    return absolutePath.slice(DASHBOARD_BASE_PATH.length) || "/";
  }
  return absolutePath;
}

function translateSegment(
  t: DocumentTitleTranslate,
  segment: { labelKey?: string; label?: string },
): string {
  if (segment.labelKey) {
    return t(segment.labelKey, { defaultValue: segment.label ?? segment.labelKey });
  }
  return segment.label?.trim() || "";
}

function resolveDashboardPageName(nestedPath: string, t: DocumentTitleTranslate): string {
  const path = nestedPath.startsWith("/") ? nestedPath : `/${nestedPath}`;

  if (isDashboardHomeNestedPath(path)) {
    return t("documentTitle.dashboard");
  }

  // Notification detail lives outside the section registry.
  if (path === "/notifications" || path.startsWith("/notifications/")) {
    return t("common.notifications", { defaultValue: "Notifications" });
  }

  const sectionId = sectionIdFromNestedPath(path);
  if (!sectionId) {
    return t("documentTitle.notFound");
  }

  const segments = resolveDashboardBreadcrumbs(path);
  const current = segments[segments.length - 1];
  const label = current ? translateSegment(t, current) : "";
  return label || t("documentTitle.dashboard");
}

/** Resolve the human-readable page name (without brand suffix) for a route. */
export function resolveDocumentPageName(
  pathname: string,
  t: DocumentTitleTranslate,
): string {
  const path = normalizePathname(pathname);

  if (path === "/" ) {
    return t("documentTitle.login");
  }

  for (const rule of STATIC_TITLE_RULES) {
    if (rule.match(path)) {
      return t(rule.titleKey);
    }
  }

  if (path === DASHBOARD_BASE_PATH || path.startsWith(`${DASHBOARD_BASE_PATH}/`)) {
    return resolveDashboardPageName(dashboardNestedPath(path), t);
  }

  return t("documentTitle.notFound");
}

/** Full browser tab title: `[Page Name] | ValueOR`. */
export function resolveDocumentTitle(
  pathname: string,
  t: DocumentTitleTranslate,
): string {
  return formatDocumentTitle(resolveDocumentPageName(pathname, t));
}
