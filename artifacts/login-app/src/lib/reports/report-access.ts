import type { ReportDefinition, ReportId } from "@/lib/reports/report-catalog";
import { REPORT_CATALOG } from "@/lib/reports/report-catalog";

export type ReportAccessContext = {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
  isModuleEnabled: (featureCode: string) => boolean | undefined;
  canViewReportsHub: boolean;
};

export function isReportAccessible(
  report: ReportDefinition,
  ctx: ReportAccessContext,
): boolean {
  if (!ctx.canViewReportsHub && !ctx.isSuperAdmin) return false;
  if (ctx.isSuperAdmin) return true;

  // Dedicated report permission OR any legacy module permission.
  const permissionOk =
    ctx.hasPermission(report.reportPermission) ||
    report.permissionsAny.some((p) => ctx.hasPermission(p));
  if (!permissionOk) return false;

  for (const moduleCode of report.requiredModules) {
    const enabled = ctx.isModuleEnabled(moduleCode);
    if (enabled === undefined) return false;
    if (!enabled) return false;
  }

  if (report.requiresAdvancedReports) {
    const advanced = ctx.isModuleEnabled("advanced_reports");
    if (advanced === undefined) return false;
    if (!advanced) return false;
  }

  return true;
}

export function filterAvailableReports(ctx: ReportAccessContext): ReportDefinition[] {
  return REPORT_CATALOG.filter((report) => isReportAccessible(report, ctx));
}

/**
 * Dropdown selection: default to overview when present; never invent inaccessible ids.
 * Legacy aliases: `ai_operations` → `ai_consumption` (merged into one report).
 */
export function resolveSelectedReportId(
  requested: string | null | undefined,
  available: ReportDefinition[],
): ReportId | null {
  if (available.length === 0) return null;
  let raw = (requested ?? "").trim();
  if (raw === "ai_operations") raw = "ai_consumption";
  if (raw && available.some((r) => r.id === raw)) {
    return raw as ReportId;
  }
  const overview = available.find((r) => r.id === "overview");
  return overview?.id ?? available[0]!.id;
}

/** @deprecated — use resolveSelectedReportId; kept for older tests. */
export function resolveReportsView(
  requested: string | null | undefined,
  available: ReportDefinition[],
): { mode: "center" | "detail"; reportId: ReportId | null } {
  const id = resolveSelectedReportId(requested, available);
  if (!id || id === "overview") {
    return { mode: "center", reportId: id === "overview" ? "overview" : null };
  }
  return { mode: "detail", reportId: id };
}
