import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import type { TFunction } from "i18next";
import i18n from "@/i18n";
import type { BillingSubscriptionStatus } from "@/lib/billing/types";

export function billingNotAvailable(t: TFunction): string {
  return t("billing.common.notAvailable");
}

export function translateBillingCycle(t: TFunction, cycle: string | null | undefined): string {
  if (!cycle) return billingNotAvailable(t);
  if (cycle === "monthly") return t("billing.filters.monthly");
  if (cycle === "yearly") return t("billing.filters.yearly");
  return cycle;
}

export function translatePlanName(
  t: TFunction,
  plan: { code?: string | null; display_name?: string | null; name?: string | null } | null | undefined,
): string {
  const code = plan?.code?.toLowerCase();
  if (code) {
    const key = `companies.commercial.packageNames.${code}`;
    if (i18n.exists(key)) return t(key);
  }
  return plan?.display_name || plan?.name || t("billing.plan.unassigned");
}

export function translateCompanyStatus(t: TFunction, status: string | null | undefined): string {
  if (!status) return billingNotAvailable(t);
  const key = `billing.companyStatus.${status}`;
  return i18n.exists(key) ? t(key) : status;
}

export function translateSubscriptionStatus(t: TFunction, status: BillingSubscriptionStatus): string {
  const key = `billing.status.${status}`;
  return i18n.exists(key) ? t(key) : status;
}

export function translateInvoiceStatus(t: TFunction, status: string | null | undefined): string {
  if (!status) return billingNotAvailable(t);
  const key = `billing.invoiceStatus.${status}`;
  return i18n.exists(key) ? t(key) : status;
}

export function translatePaymentStatus(t: TFunction, status: string | null | undefined): string {
  if (!status) return billingNotAvailable(t);
  const key = `billing.paymentStatus.${status}`;
  return i18n.exists(key) ? t(key) : status;
}

export function translateAuditSource(t: TFunction, source: string | null | undefined): string {
  if (!source) return billingNotAvailable(t);
  const key = `billing.audit.source.${source}`;
  return i18n.exists(key) ? t(key) : source;
}

export function translateProviderStatus(t: TFunction, status: string | null | undefined): string {
  if (!status) return billingNotAvailable(t);
  const key = `billing.providerStatus.${status}`;
  return i18n.exists(key) ? t(key) : status;
}

export function translateWorkspaceHealth(t: TFunction, health: string | null | undefined): string {
  if (!health) return billingNotAvailable(t);
  const key = `billing.workspaceHealth.${health}`;
  return i18n.exists(key) ? t(key) : health.replace(/_/g, " ");
}

export function formatBillingUnit(
  t: TFunction,
  value: number | string | null | undefined,
  unit: "gb" | "mb" | "ms" | "percent" | "none",
): string {
  if (value == null || value === "") return billingNotAvailable(t);
  const formatted = typeof value === "number" ? value.toLocaleString() : value;
  switch (unit) {
    case "gb":
      return t("billing.common.units.gb", { value: formatted });
    case "mb":
      return t("billing.common.units.mb", { value: formatted });
    case "ms":
      return t("billing.common.units.ms", { value: formatted });
    case "percent":
      return t("billing.common.units.percent", { value: formatted });
    default:
      return String(formatted);
  }
}

export function formatLocalizedDate(date: Date | null, language: string): string | null {
  if (!date) return null;
  const locale = language === "ar" ? ar : enUS;
  return format(date, "PPP", { locale });
}
