/**
 * Central money formatters.
 *
 * formatCompanyMoney  → company OPERATIONAL currency (invoices, reports, CRM)
 * formatSubscriptionMoney → ValueOR SUBSCRIPTION billing currency (checkout, portal)
 *
 * Never pass operational currency into subscription formatters by accident.
 */

import {
  getCompanyCurrency,
  getCompanyIntlLocale,
} from "@/lib/company-locale/runtime";
import { currencyFractionDigits, normalizeCurrencyCode } from "@/lib/currency/catalog";

export type MoneyFormatOptions = {
  locale?: string | null;
  /** When true, omit currency style and append ISO code (safer for ambiguous $). */
  preferCode?: boolean;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
};

function safeNumber(amount: number | null | undefined): number | null {
  if (amount == null) return null;
  const n = Number(amount);
  return Number.isFinite(n) ? n : null;
}

function formatWithIntl(
  amount: number,
  currency: string,
  locale: string,
  options?: MoneyFormatOptions,
): string {
  const digits = options?.maximumFractionDigits ?? currencyFractionDigits(currency);
  const min = options?.minimumFractionDigits ?? digits;
  if (options?.preferCode) {
    try {
      const number = new Intl.NumberFormat(locale, {
        minimumFractionDigits: min,
        maximumFractionDigits: digits,
      }).format(amount);
      return `${currency} ${number}`;
    } catch {
      return `${currency} ${amount.toFixed(digits)}`;
    }
  }
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: min,
      maximumFractionDigits: digits,
    }).format(amount);
  } catch {
    return `${amount.toFixed(digits)} ${currency}`;
  }
}

/**
 * Company operational money (invoices, payments, dashboards, Customer 360).
 * Defaults to company operational currency from CompanyLocale runtime.
 */
export function formatCompanyMoney(
  amount: number | null | undefined,
  companyOperationalCurrency?: string | null,
  locale?: string | null,
  options?: MoneyFormatOptions,
): string {
  const n = safeNumber(amount);
  if (n == null) return "—";
  const code =
    normalizeCurrencyCode(companyOperationalCurrency) ||
    normalizeCurrencyCode(getCompanyCurrency()) ||
    "EGP";
  const intlLocale = options?.locale || locale || getCompanyIntlLocale();
  return formatWithIntl(n, code, intlLocale, options);
}

/**
 * ValueOR subscription / SaaS money. Requires an explicit billing currency —
 * never silently falls back to company operational currency.
 */
export function formatSubscriptionMoney(
  amount: number | null | undefined,
  subscriptionBillingCurrency: string | null | undefined,
  locale?: string | null,
  options?: MoneyFormatOptions,
): string {
  const n = safeNumber(amount);
  if (n == null) return "—";
  const code = normalizeCurrencyCode(subscriptionBillingCurrency);
  if (!code) return "—";
  const intlLocale = options?.locale || locale || getCompanyIntlLocale();
  return formatWithIntl(n, code, intlLocale, options);
}

/**
 * Detect mixed-currency aggregation (reports must not silently sum).
 */
export function assertHomogeneousCurrency(
  currencies: Array<string | null | undefined>,
): { ok: true; currency: string } | { ok: false; currencies: string[] } {
  const unique = [
    ...new Set(
      currencies
        .map((c) => normalizeCurrencyCode(c))
        .filter((c): c is string => Boolean(c)),
    ),
  ];
  if (unique.length === 0) return { ok: false, currencies: [] };
  if (unique.length > 1) return { ok: false, currencies: unique };
  return { ok: true, currency: unique[0]! };
}
