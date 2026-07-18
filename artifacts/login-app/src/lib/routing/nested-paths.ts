import { isUuidSegment } from "@/lib/billing/subscription-status-display";

/**
 * # Routing standard — nest-relative only
 *
 * Wouter mounts nested routers at `/dashboard`, then again at section bases
 * (`/subscriptions`, `/workspace`). Each nest exposes paths **relative to its base**.
 *
 * | Scope              | useLocation() example | Correct href / navigate target |
 * |--------------------|-----------------------|--------------------------------|
 * | Dashboard          | `/subscriptions`      | `/subscriptions` (section entry) |
 * | Billing (nested)   | `/payments`           | `/payments`                      |
 * | Billing detail     | `/{companyUuid}`      | `/{companyUuid}`                 |
 * | Workspace (nested) | `/usage`              | `/usage`                         |
 * | Root escape        | —                     | `~/login`                        |
 *
 * **Never** prefix a parent segment inside a nested scope (e.g. no `/subscriptions/payments`
 * inside the billing layout — that produces `/dashboard/subscriptions/subscriptions/payments`).
 *
 * Registry `nestedPath` values (`/`, `/payments`, …) are authoritative. Use the helpers below
 * instead of string-concatenating section names.
 */

export const NEST_INDEX = "/" as const;

/** Dashboard absolute prefix (for tests / external links only). */
export const DASHBOARD_ABSOLUTE_PREFIX = "/dashboard";

/** Turn a registry nestedPath into a nest-relative href. */
export function nestedSectionHref(nestedPath: string): string {
  if (nestedPath === "/" || nestedPath === "") {
    return NEST_INDEX;
  }
  return nestedPath.startsWith("/") ? nestedPath : `/${nestedPath}`;
}

/** Billing / workspace subscription detail — single UUID segment under billing nest. */
export function billingDetailHref(companyId: string): string {
  return nestedSectionHref(companyId);
}

/** Whether the current nest-relative location is a billing detail page. */
export function isBillingDetailNestPath(location: string): boolean {
  const segment = normalizeNestPath(location).split("/").filter(Boolean)[0];
  return Boolean(segment && isUuidSegment(segment));
}

/** Sub-nav active state inside a section nest (detail pages do not activate section tabs). */
export function isNestedSectionActive(location: string, nestedPath: string): boolean {
  const current = normalizeNestPath(location);
  const target = nestedSectionHref(nestedPath);

  if (isBillingDetailNestPath(current)) {
    return false;
  }

  if (target === NEST_INDEX) {
    return current === NEST_INDEX;
  }

  return current === target || current.startsWith(`${target}/`);
}

function normalizeNestPath(path: string): string {
  if (!path || path === "") {
    return NEST_INDEX;
  }
  return path.startsWith("/") ? path : `/${path}`;
}

/** Compose dashboard absolute URL from a dashboard-nest-relative path (tests, assertions). */
export function toDashboardAbsolutePath(dashboardNestPath: string): string {
  const normalized = normalizeNestPath(dashboardNestPath);
  if (normalized === NEST_INDEX) {
    return DASHBOARD_ABSOLUTE_PREFIX;
  }
  return `${DASHBOARD_ABSOLUTE_PREFIX}${normalized}`;
}

/** Fail when any adjacent path segments repeat (guards duplicated nest prefixes). */
export function assertNoDuplicateAdjacentSegments(absolutePath: string): void {
  const segments = absolutePath.split("/").filter(Boolean);
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (segments[i] === segments[i + 1]) {
      throw new Error(`Duplicate adjacent path segment "${segments[i]}" in ${absolutePath}`);
    }
  }
}
