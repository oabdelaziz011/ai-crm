import {
  getDashboardRouteById,
  sectionIdFromNestedPath,
  type DashboardSectionId,
} from "@/config/dashboard-route-registry";
import { SETTINGS_ROUTE_REGISTRY } from "@/config/settings-route-registry";
import { BILLING_ROUTE_REGISTRY } from "@/config/billing-route-registry";
import { WORKSPACE_ROUTE_REGISTRY } from "@/config/workspace-route-registry";
import { KNOWLEDGE_ROUTE_REGISTRY } from "@/config/knowledge-route-registry";
import { SCHEDULING_DASHBOARD_ROUTE_REGISTRY } from "@/config/scheduling-dashboard-route-registry";
import { SCHEDULING_ROUTE_REGISTRY } from "@/config/scheduling-route-registry";
import { COMPANY_ROUTE_REGISTRY } from "@/config/company-route-registry";
import { isUuidSegment } from "@/lib/billing/subscription-status-display";
import { isDashboardHomeNestedPath } from "@/lib/dashboard-home";

export type BreadcrumbSegment = {
  /** i18n key or literal label */
  labelKey?: string;
  label?: string;
  href?: string;
  isCurrent?: boolean;
};

type NestedRegistryEntry = {
  nestedPath: string;
  titleKey: string;
};

function normalizePath(path: string): string {
  if (!path || path === "") return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

function findRegistryMatch(
  registry: readonly NestedRegistryEntry[],
  subPath: string,
): NestedRegistryEntry | null {
  const normalized = normalizePath(subPath);
  const exact = registry.find((r) => normalizePath(r.nestedPath) === normalized);
  if (exact) return exact;

  let best: NestedRegistryEntry | null = null;
  for (const entry of registry) {
    const entryPath = normalizePath(entry.nestedPath);
    if (entryPath === "/") continue;
    if (normalized === entryPath || normalized.startsWith(`${entryPath}/`)) {
      if (!best || entryPath.length > normalizePath(best.nestedPath).length) {
        best = entry;
      }
    }
  }
  return best;
}

function resolveNestedSegments(
  sectionId: DashboardSectionId,
  remainder: string,
): BreadcrumbSegment[] {
  const segments: BreadcrumbSegment[] = [];
  const sub = normalizePath(remainder);

  if (sectionId === "settings") {
    if (sub.startsWith("/scheduling")) {
      const schedRemainder = sub.replace(/^\/scheduling/, "") || "/";
      const schedMatch = findRegistryMatch(SCHEDULING_ROUTE_REGISTRY, schedRemainder);
      if (schedMatch) {
        segments.push({ labelKey: "navigation.scheduling", href: "/settings/scheduling" });
        segments.push({ labelKey: schedMatch.titleKey });
        return segments;
      }
    }

    if (sub.startsWith("/company")) {
      const companyRemainder = sub.replace(/^\/company/, "") || "/";
      const parts = companyRemainder.split("/").filter(Boolean);
      segments.push({ labelKey: "dashboard.settings.nav.companySettings", href: "/settings/company" });

      if (parts[0] === "branches") {
        segments.push({ labelKey: "branches.nav.title", href: "/settings/company/branches" });
        if (parts[1] && isUuidSegment(parts[1])) {
          segments.push({ label: parts[1].slice(0, 8).toUpperCase() });
        }
        return segments;
      }

      const companyMatch = findRegistryMatch(COMPANY_ROUTE_REGISTRY, companyRemainder);
      if (companyMatch && normalizePath(companyMatch.nestedPath) !== "/") {
        segments.push({ labelKey: companyMatch.titleKey });
      }
      return segments;
    }

    const settingsMatch = findRegistryMatch(SETTINGS_ROUTE_REGISTRY, sub);
    if (settingsMatch && normalizePath(settingsMatch.nestedPath) !== "/") {
      segments.push({ labelKey: settingsMatch.titleKey });
    }
    return segments;
  }

  const registryMap: Partial<Record<DashboardSectionId, readonly NestedRegistryEntry[]>> = {
    subscriptions: BILLING_ROUTE_REGISTRY,
    workspace: WORKSPACE_ROUTE_REGISTRY,
    knowledge: KNOWLEDGE_ROUTE_REGISTRY,
    scheduling: SCHEDULING_DASHBOARD_ROUTE_REGISTRY,
  };

  const registry = registryMap[sectionId];
  if (!registry) {
    const parts = sub.split("/").filter(Boolean);
    if (parts.length === 1 && isUuidSegment(parts[0]!)) {
      segments.push({ labelKey: "appShell.breadcrumbs.detail" });
    }
    return segments;
  }

  const match = findRegistryMatch(registry, sub);
  if (match && normalizePath(match.nestedPath) !== "/") {
    segments.push({ labelKey: match.titleKey });
  }

  const parts = sub.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  if (last && isUuidSegment(last) && !segments.some((s) => s.labelKey === "appShell.breadcrumbs.detail")) {
    segments.push({ labelKey: "appShell.breadcrumbs.detail" });
  }

  return segments;
}

/** Build breadcrumb segments from dashboard nest-relative path. */
export function resolveDashboardBreadcrumbs(nestedPath: string): BreadcrumbSegment[] {
  const path = normalizePath(nestedPath);
  const segments: BreadcrumbSegment[] = [{ labelKey: "dashboard.breadcrumbs.root", href: "/" }];

  if (isDashboardHomeNestedPath(path)) {
    segments.push({ labelKey: "navigation.home", isCurrent: true });
    return segments;
  }

  const sectionId = sectionIdFromNestedPath(path);
  if (!sectionId) {
    segments.push({ labelKey: "navigation.home", isCurrent: true });
    return segments;
  }

  const route = getDashboardRouteById(sectionId);
  const basePath = normalizePath(route.nestedPath);
  segments.push({
    labelKey: route.titleKey,
    href: basePath,
  });

  let remainder = path === basePath ? "" : path.slice(basePath.length);
  if (remainder.startsWith("/")) {
    /* already relative */
  } else if (remainder) {
    remainder = `/${remainder}`;
  }

  const nested = resolveNestedSegments(sectionId, remainder);
  for (const nestedSegment of nested) {
    segments.push(nestedSegment);
  }

  if (segments.length > 0) {
    const last = segments[segments.length - 1]!;
    segments[segments.length - 1] = { ...last, isCurrent: true, href: undefined };
  }

  return segments;
}
