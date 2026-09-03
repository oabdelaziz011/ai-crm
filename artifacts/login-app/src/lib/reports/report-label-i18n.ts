import type { TFunction } from "i18next";

/**
 * Translate report enum / status labels for display (never invent values — only known maps).
 */
export function translateReportLabel(
  t: TFunction<"common">,
  raw: string | null | undefined,
): string {
  const value = (raw ?? "").trim();
  if (!value) return "—";
  const key = value.toLowerCase().replace(/\s+/g, "_");
  const map: Record<string, string> = {
    active: "dashboard.reports.labels.active",
    trial: "dashboard.reports.labels.trial",
    trialing: "dashboard.reports.labels.trialing",
    suspended: "dashboard.reports.labels.suspended",
    expired: "dashboard.reports.labels.expired",
    past_due: "dashboard.reports.labels.pastDue",
    canceled: "dashboard.reports.labels.canceled",
    cancelled: "dashboard.reports.labels.canceled",
    pending: "dashboard.reports.catalog.pending",
    confirmed: "dashboard.reports.catalog.confirmed",
    paid: "status.paid",
    unpaid: "status.unpaid",
    overdue: "status.overdue",
    draft: "dashboard.reports.labels.draft",
    basic: "dashboard.reports.labels.planBasic",
    pro: "dashboard.reports.labels.planPro",
    enterprise: "dashboard.reports.labels.planEnterprise",
    free: "dashboard.reports.labels.planFree",
    monthly: "dashboard.reports.labels.monthly",
    yearly: "dashboard.reports.labels.yearly",
    unknown: "dashboard.reports.labels.unknown",
  };
  const i18nKey = map[key] ?? map[value];
  if (i18nKey) return t(i18nKey, value);
  return value;
}
