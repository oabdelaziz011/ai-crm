/**
 * Phase 1C — Permission-aware navigation using DASHBOARD_ROUTE_REGISTRY + dashboardNestHref.
 * Never invents routes. Never bypasses isDashboardRoutePermitted.
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

export type GuideNavigateRequest =
  | { kind: "route"; routeId: string }
  | { kind: "task"; taskId: GuideTaskId }
  | { kind: "path"; nestedPath: string };

export type GuideNavigateResult =
  | {
      ok: true;
      routeId: DashboardSectionId;
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

export function resolveGuideRouteIdFromNestedPath(
  nestedPath: string,
): DashboardSectionId | null {
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
