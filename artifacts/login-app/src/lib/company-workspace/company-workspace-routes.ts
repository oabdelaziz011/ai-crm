import type { CompanyWorkspaceTabId } from "@/lib/company-workspace/types";
import { toDashboardAbsolutePath } from "@/lib/routing";

/**
 * Nest-relative Company Workspace paths (under wouter `/dashboard` nest).
 * Never put `/dashboard` in these values.
 */
export const COMPANY_WORKSPACE_BASE = "/company";

export const COMPANY_ROUTES = {
  overview: "/company",
  employees: "/company?tab=employees",
  branches: "/company?tab=branches",
  departments: "/company?tab=departments",
  branding: "/company?tab=branding",
  subscription: "/company?tab=subscription",
} as const satisfies Record<CompanyWorkspaceTabId, string>;

/** Strip accidental dashboard absolute prefixes from a nest path. */
function asNestRelative(path: string): string {
  let next = path.trim();
  // Collapse any doubled/absolute dashboard prefixes back to nest-relative.
  while (next.startsWith("/dashboard/")) {
    next = next.slice("/dashboard".length);
  }
  if (next.startsWith("/dashboard?")) {
    next = `/${next.slice("/dashboard".length)}`;
  }
  if (!next.startsWith("/")) next = `/${next}`;
  return next;
}

/**
 * Nest-relative path only (`/company` or `/company?tab=…`).
 * Safe to pass to setLocation/Link inside the `/dashboard` nest.
 */
export function companyWorkspaceNestPath(
  tab: CompanyWorkspaceTabId = "overview",
  extras?: { invite?: boolean; employeeId?: string },
): string {
  if (!extras?.invite && !extras?.employeeId) {
    return asNestRelative(COMPANY_ROUTES[tab]);
  }
  const params = new URLSearchParams();
  const resolvedTab = extras?.employeeId ? "employees" : tab;
  if (resolvedTab !== "overview") params.set("tab", resolvedTab);
  if (extras?.invite) params.set("invite", "1");
  if (extras?.employeeId) params.set("employee", extras.employeeId);
  return asNestRelative(`${COMPANY_WORKSPACE_BASE}?${params.toString()}`);
}

/**
 * Preferred navigate/href target from inside the dashboard nest.
 * Uses wouter `~` root escape so `/dashboard` is never double-prefixed
 * (`/dashboard` + `/dashboard/company` → `/dashboard/dashboard/company`).
 */
export function companyWorkspaceHref(
  tab: CompanyWorkspaceTabId = "overview",
  extras?: { invite?: boolean; employeeId?: string },
): string {
  const nest = companyWorkspaceNestPath(tab, extras);
  const qIndex = nest.indexOf("?");
  const pathname = qIndex >= 0 ? nest.slice(0, qIndex) : nest;
  const query = qIndex >= 0 ? nest.slice(qIndex + 1) : "";
  const absolute = toDashboardAbsolutePath(pathname);
  return query ? `~${absolute}?${query}` : `~${absolute}`;
}
