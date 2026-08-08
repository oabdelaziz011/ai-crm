import i18n from "@/i18n";
import {
  getCompanyCurrency,
  getCompanyIntlLocale,
  getCompanyTimezone,
} from "@/lib/company-locale/runtime";

function billingFallback(): string {
  return i18n.t("billing.common.notAvailable");
}

/**
 * Format a major-unit amount. Defaults to company billing `default_currency`
 * when `currency` is omitted (synced by CompanyLocaleProvider).
 */
export function formatBillingCurrency(
  amount: number | null | undefined,
  currency?: string,
): string {
  if (amount == null || Number.isNaN(Number(amount))) return billingFallback();
  const code = currency || getCompanyCurrency();
  const locale = getCompanyIntlLocale();
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(
      Number(amount),
    );
  } catch {
    return `${Number(amount).toFixed(2)} ${code}`;
  }
}

export function formatBillingDate(value: string | null | undefined, withTime = false): string {
  if (!value) return billingFallback();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return billingFallback();
  const locale = getCompanyIntlLocale();
  const timeZone = getCompanyTimezone();
  try {
    return withTime
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone,
        }).format(date)
      : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone }).format(date);
  } catch {
    return withTime ? date.toLocaleString() : date.toLocaleDateString();
  }
}

export function shortCompanyId(companyId: string): string {
  return companyId.slice(0, 8).toUpperCase();
}
