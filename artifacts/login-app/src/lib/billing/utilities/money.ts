/** Money utilities — all financial math in cents to avoid float errors. */

import {
  getCompanyCurrency,
  getCompanyIntlLocale,
} from "@/lib/company-locale/runtime";

export function centsFromDecimal(amount: number): number {
  return Math.round(amount * 100);
}

export function decimalFromCents(cents: number): number {
  return cents / 100;
}

/**
 * Format cents using company billing currency when `currency` is omitted.
 * Synced by CompanyLocaleProvider from billing `default_currency`.
 */
export function formatMoney(
  cents: number,
  currency?: string,
  locale?: string,
): string {
  const code = currency || getCompanyCurrency();
  const intlLocale = locale || getCompanyIntlLocale();
  try {
    return new Intl.NumberFormat(intlLocale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
    }).format(decimalFromCents(cents));
  } catch {
    return `${decimalFromCents(cents).toFixed(2)} ${code}`;
  }
}

export function sumCents(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

export function applyPercentageDiscount(amountCents: number, percent: number): number {
  return Math.round(amountCents * (percent / 100));
}

export function clampCents(value: number, min = 0, max?: number): number {
  const clamped = Math.max(min, value);
  return max !== undefined ? Math.min(clamped, max) : clamped;
}
