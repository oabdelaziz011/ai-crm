/**
 * Phase 1B — Permission-aware Guide authorization against effective RBAC.
 * Fail closed when permission context is missing or incomplete.
 */
import {
  getDashboardRouteById,
  isDashboardRoutePermitted,
  type CommercialFeatureEnabledLookup,
  type DashboardRouteDefinition,
  type DashboardSectionId,
  type PlatformFeatureEnabledLookup,
} from "@/config/dashboard-route-registry";
import {
  getGuideTaskRequirement,
  type GuideTaskId,
} from "./permission-matrix";
import { findGuidePageByRouteId } from "./product-knowledge";
import { GUIDE_SETTINGS_CHANNEL_TARGETS } from "./guide-settings-targets";

export type GuideEffectiveAuth = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  /** Effective permission codes from AuthContext / load_user_auth_context. */
  permissionCodes: readonly string[];
  /** True while auth is still loading or refreshing without a usable set. */
  permissionsAvailable: boolean;
  isRefreshing?: boolean;
  /** Optional commercial / platform gates already resolved by the host UI. */
  platformFeatureEnabled?: PlatformFeatureEnabledLookup;
  commercialFeatureEnabled?: CommercialFeatureEnabledLookup;
};

export type GuideAccessDecision =
  | { allowed: true; missing: readonly string[] }
  | { allowed: false; reason: "missing_context" | "missing_permissions" | "denied"; missing: readonly string[] };

function hasCode(auth: GuideEffectiveAuth, code: string): boolean {
  if (auth.isSuperAdmin) return true;
  return auth.permissionCodes.includes(code);
}

function hasNonEmptyId(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Guide navigation / route gates require authenticated user + tenant + usable permissions.
 * Permission codes alone must never authorize when identity/tenant context is missing.
 */
export function hasGuideNavigationContext(auth: GuideEffectiveAuth): boolean {
  return (
    auth.permissionsAvailable === true &&
    hasNonEmptyId(auth.userId) &&
    hasNonEmptyId(auth.companyId)
  );
}

export function createGuideHasPermission(auth: GuideEffectiveAuth): (code: string) => boolean {
  return (code: string) => hasCode(auth, code);
}

export function evaluateGuideTaskAccess(
  auth: GuideEffectiveAuth,
  taskId: GuideTaskId,
): GuideAccessDecision {
  if (!hasGuideNavigationContext(auth)) {
    return { allowed: false, reason: "missing_context", missing: [] };
  }

  const requirement = getGuideTaskRequirement(taskId);
  const missing = requirement.allOf.filter((code) => !hasCode(auth, code));
  if (missing.length > 0) {
    return { allowed: false, reason: "missing_permissions", missing };
  }
  return { allowed: true, missing: [] };
}

export function evaluateGuideRouteAccess(
  auth: GuideEffectiveAuth,
  routeId: DashboardSectionId | string,
): GuideAccessDecision & { route: DashboardRouteDefinition | null } {
  if (!hasGuideNavigationContext(auth)) {
    return { allowed: false, reason: "missing_context", missing: [], route: null };
  }

  let route: DashboardRouteDefinition | null = null;
  try {
    route = getDashboardRouteById(routeId as DashboardSectionId);
  } catch {
    return { allowed: false, reason: "denied", missing: [], route: null };
  }

  const permitted = isDashboardRoutePermitted(
    route,
    auth.isSuperAdmin,
    createGuideHasPermission(auth),
    auth.platformFeatureEnabled,
    auth.commercialFeatureEnabled,
  );

  if (!permitted) {
    const missing = route.permission && !hasCode(auth, route.permission) ? [route.permission] : [];
    return { allowed: false, reason: "missing_permissions", missing, route };
  }

  return { allowed: true, missing: [], route };
}

const GUIDE_ROUTE_CANDIDATES: readonly DashboardSectionId[] = [
  "customers",
  "tickets",
  "leads",
  "opportunities",
  "bookings",
  "calendar",
  "scheduling",
  "invoices",
  "financial",
  "omnichannel",
  "whatsapp",
  "email",
  "ai-assistant",
  "ai-employees",
  "website",
  "organization",
  "users",
  "roles",
  "company",
  "knowledge",
  "channels",
  "quotes",
  "settings",
  "automation",
];

/** Snapshot of permitted Guide route ids for the current user (dynamic each call). */
export function listPermittedGuideRouteIds(auth: GuideEffectiveAuth): string[] {
  if (!auth.permissionsAvailable) return [];
  const ids: string[] = [];
  for (const routeId of GUIDE_ROUTE_CANDIDATES) {
    // Never advertise legacy dashboard `whatsapp` (Omnichannel redirect) to the Guide LLM.
    if (routeId === "whatsapp") continue;
    const decision = evaluateGuideRouteAccess(auth, routeId);
    if (decision.allowed) ids.push(routeId);
  }
  // Channel connect pages live under Settings — expose logical Guide route ids.
  for (const target of Object.values(GUIDE_SETTINGS_CHANNEL_TARGETS)) {
    if (!hasGuideNavigationContext(auth)) continue;
    const rbacOk =
      auth.isSuperAdmin || target.anyOfPermissions.some((code) => hasCode(auth, code));
    const commercialOk =
      auth.isSuperAdmin ||
      auth.commercialFeatureEnabled?.(target.commercialFeatureCode) === true;
    if (rbacOk && commercialOk) {
      ids.push(`settings.${target.id}`);
    }
  }
  return ids;
}

export function buildGuidePermissionSnapshot(auth: GuideEffectiveAuth): {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  permissionsAvailable: boolean;
  isRefreshing: boolean;
  /** Sorted unique codes — fresh each build; never cache across turns. */
  permissionCodes: string[];
  permittedRouteIds: string[];
  capturedAt: string;
} {
  const codes = [...new Set(auth.permissionCodes)].sort();
  return {
    userId: auth.userId,
    companyId: auth.companyId,
    isSuperAdmin: auth.isSuperAdmin,
    permissionsAvailable: auth.permissionsAvailable,
    isRefreshing: auth.isRefreshing === true,
    permissionCodes: codes,
    permittedRouteIds: listPermittedGuideRouteIds({
      ...auth,
      permissionCodes: codes,
    }),
    capturedAt: new Date().toISOString(),
  };
}

export function describeDeniedTask(input: {
  taskId: GuideTaskId;
  decision: GuideAccessDecision;
}): {
  canDescribeModule: boolean;
  canNavigate: boolean;
  missing: readonly string[];
  routeId: DashboardSectionId | undefined;
} {
  const req = getGuideTaskRequirement(input.taskId);
  const page = req.routeId ? findGuidePageByRouteId(req.routeId) : null;
  const viewOnlyMissing =
    !input.decision.allowed &&
    input.decision.reason === "missing_permissions" &&
    input.decision.missing.every((m) => !m.endsWith(".view"));

  return {
    canDescribeModule: input.decision.allowed || viewOnlyMissing || Boolean(page),
    canNavigate: input.decision.allowed,
    missing: input.decision.allowed ? [] : input.decision.missing,
    routeId: req.routeId,
  };
}
