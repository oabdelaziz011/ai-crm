/**
 * Phase 1C — Permission-aware navigation using DASHBOARD_ROUTE_REGISTRY + Settings
 * channel pages for WhatsApp / Messenger / Instagram connect walkthroughs.
 */
import {
  DASHBOARD_ROUTE_REGISTRY,
  type DashboardSectionId,
} from "@/config/dashboard-route-registry";
import { dashboardNestHref } from "@/lib/routing";
import {
  evaluateGuideRouteAccess,
  evaluateGuideTaskAccess,
  hasGuideNavigationContext,
  type GuideEffectiveAuth,
} from "./guide-auth";
import { getGuideTaskRequirement, type GuideTaskId } from "./permission-matrix";
import {
  GUIDE_SETTINGS_CHANNEL_TARGETS,
  resolveGuideSettingsChannelId,
  resolveGuideSettingsTargetFromPath,
  type GuideSettingsTarget,
} from "./guide-settings-targets";

export type GuideNavigateRequest =
  | { kind: "route"; routeId: string }
  | { kind: "task"; taskId: GuideTaskId }
  | { kind: "path"; nestedPath: string };

export type GuideNavigateResult =
  | {
      ok: true;
      routeId: string;
      nestedPath: string;
      href: string;
      titleKey: string;
    }
  | {
      ok: false;
      reason: "unknown_route" | "unauthorized" | "missing_context" | "unsupported";
      missingPermissions: readonly string[];
      routeId?: string;
    };

function hasAnyPermission(auth: GuideEffectiveAuth, codes: readonly string[]): boolean {
  if (auth.isSuperAdmin) return true;
  return codes.some((code) => auth.permissionCodes.includes(code));
}

function authorizeSettingsTarget(
  auth: GuideEffectiveAuth,
  target: GuideSettingsTarget,
): GuideNavigateResult {
  if (!hasAnyPermission(auth, target.anyOfPermissions)) {
    return {
      ok: false,
      reason: "unauthorized",
      missingPermissions: [...target.anyOfPermissions],
      routeId: `settings.${target.id}`,
    };
  }
  // Mirror Settings commercial entitlement (missing lookup = deny, same as dashboard routes).
  if (!auth.isSuperAdmin) {
    const entitled = auth.commercialFeatureEnabled?.(target.commercialFeatureCode) === true;
    if (!entitled) {
      return {
        ok: false,
        reason: "unauthorized",
        missingPermissions: [target.commercialFeatureCode],
        routeId: `settings.${target.id}`,
      };
    }
  }
  const nest = target.href.replace(/^\/dashboard/, "") || target.href;
  return {
    ok: true,
    routeId: `settings.${target.id}`,
    nestedPath: nest.startsWith("/") ? nest : `/${nest}`,
    href: dashboardNestHref(target.href),
    titleKey: target.titleKey,
  };
}

export function resolveGuideRouteIdFromNestedPath(
  nestedPath: string,
): DashboardSectionId | null {
  const settings = resolveGuideSettingsTargetFromPath(nestedPath);
  if (settings) {
    // Settings channel paths are not dashboard section ids; callers use authorizeGuideNavigation.
    return null;
  }
  const normalized = nestedPath.startsWith("/") ? nestedPath : `/${nestedPath}`;
  const exact = DASHBOARD_ROUTE_REGISTRY.find((r) => r.nestedPath === normalized);
  if (exact) return exact.id;
  const prefix = DASHBOARD_ROUTE_REGISTRY.find(
    (r) => normalized === r.nestedPath || normalized.startsWith(`${r.nestedPath}/`),
  );
  return prefix?.id ?? null;
}

export function authorizeGuideNavigation(
  auth: GuideEffectiveAuth,
  request: GuideNavigateRequest,
): GuideNavigateResult {
  // Fail closed: never navigate from permission codes alone without user + tenant.
  if (!hasGuideNavigationContext(auth)) {
    return { ok: false, reason: "missing_context", missingPermissions: [] };
  }

  if (request.kind === "path") {
    const settingsFromPath = resolveGuideSettingsTargetFromPath(request.nestedPath);
    if (settingsFromPath) {
      return authorizeSettingsTarget(auth, settingsFromPath);
    }
  }

  let routeId: string | null = null;

  if (request.kind === "route") {
    routeId = request.routeId;
  } else if (request.kind === "task") {
    const taskDecision = evaluateGuideTaskAccess(auth, request.taskId);
    if (!taskDecision.allowed) {
      return {
        ok: false,
        reason: taskDecision.reason === "missing_context" ? "missing_context" : "unauthorized",
        missingPermissions: taskDecision.missing,
        routeId: getGuideTaskRequirement(request.taskId).routeId,
      };
    }
    // Channel connect tasks open Settings pages, not the legacy dashboard redirect.
    if (request.taskId === "whatsapp.view" || request.taskId === "whatsapp.manage") {
      return authorizeSettingsTarget(auth, GUIDE_SETTINGS_CHANNEL_TARGETS.whatsapp);
    }
    routeId = getGuideTaskRequirement(request.taskId).routeId ?? null;
    if (!routeId) {
      return { ok: false, reason: "unsupported", missingPermissions: [] };
    }
  } else {
    routeId = resolveGuideRouteIdFromNestedPath(request.nestedPath);
    if (!routeId) {
      return { ok: false, reason: "unknown_route", missingPermissions: [] };
    }
  }

  const settingsChannel = resolveGuideSettingsChannelId(routeId);
  if (settingsChannel) {
    return authorizeSettingsTarget(auth, GUIDE_SETTINGS_CHANNEL_TARGETS[settingsChannel]);
  }

  const known = DASHBOARD_ROUTE_REGISTRY.some((r) => r.id === routeId);
  if (!known) {
    return { ok: false, reason: "unknown_route", missingPermissions: [], routeId };
  }

  const decision = evaluateGuideRouteAccess(auth, routeId);
  if (!decision.route) {
    return { ok: false, reason: "unknown_route", missingPermissions: [], routeId };
  }
  if (!decision.allowed) {
    return {
      ok: false,
      reason: decision.reason === "missing_context" ? "missing_context" : "unauthorized",
      missingPermissions: decision.missing,
      routeId,
    };
  }

  return {
    ok: true,
    routeId: decision.route.id,
    nestedPath: decision.route.nestedPath,
    href: dashboardNestHref(decision.route.nestedPath),
    titleKey: decision.route.titleKey,
  };
}
