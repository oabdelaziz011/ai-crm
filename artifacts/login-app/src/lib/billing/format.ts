import i18n from "@/i18n";
import {
  getCompanyCurrency,
  getCompanyIntlLocale,
  getCompanyTimezone,
} from "@/lib/company-locale/runtime";
import { formatCompanyMoney, formatSubscriptionMoney } from "@/lib/currency/format-money";

function billingFallback(): string {
  return i18n.t("billing.common.notAvailable");
}

/**
 * Format a major-unit amount in company OPERATIONAL currency.
 * Defaults to company operational currency when `currency` is omitted
 * (synced by CompanyLocaleProvider from financial / billing settings).
 *
 * Do NOT use this for ValueOR subscription checkout prices — use
 * formatSubscriptionMoney / formatBillingSubscriptionCurrency instead.
 */
export function formatBillingCurrency(
  amount: number | null | undefined,
  currency?: string,
): string {
  if (amount == null || Number.isNaN(Number(amount))) return billingFallback();
  return formatCompanyMoney(amount, currency || getCompanyCurrency(), getCompanyIntlLocale());
}

/** Explicit alias for company operational money formatting. */
export const formatCompanyOperationalCurrency = formatBillingCurrency;

/**
 * Format ValueOR subscription / SaaS amounts. Requires subscription billing currency.
 */
export function formatBillingSubscriptionCurrency(
  amount: number | null | undefined,
  subscriptionBillingCurrency: string | null | undefined,
): string {
  if (amount == null || Number.isNaN(Number(amount))) return billingFallback();
  const formatted = formatSubscriptionMoney(
    amount,
    subscriptionBillingCurrency,
    getCompanyIntlLocale(),
  );
  return formatted === "—" ? billingFallback() : formatted;
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
