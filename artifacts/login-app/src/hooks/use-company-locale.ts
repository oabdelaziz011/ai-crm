import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import {
  parseBillingSettingString,
  useBillingSettingValue,
} from "@/hooks/billing/use-billing-setting-value";
import { useMyProfile } from "@/hooks/use-my-profile";
import {
  getCompanyCurrency,
  resolveIntlLocale,
  type CompanyLocaleRuntime,
} from "@/lib/company-locale/runtime";
import { decimalFromCents } from "@/lib/billing/utilities/money";

export type CompanyLocale = CompanyLocaleRuntime & {
  /** Intl date style used by formatDate (derived from language). */
  dateFormat: "medium";
  /** Number formatting locale id (same as intlLocale). */
  numberFormat: string;
  /** Format minor units (cents) as currency. */
  formatMoney: (cents: number, currencyOverride?: string) => string;
  /** Format major units (decimal amount) as currency. */
  formatCurrency: (amount: number, currencyOverride?: string) => string;
  formatDate: (value: string | Date | null | undefined, withTime?: boolean) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  isLoading: boolean;
};

/**
 * Global company localization — currency from billing settings, language/TZ from profile.
 * Reuses existing React Query caches only.
 */
export function useCompanyLocale(): CompanyLocale {
  const { i18n } = useTranslation();
  const { company } = useAuth();
  const companyId = company?.id ?? null;
  const { data: profile } = useMyProfile();
  const currencyQuery = useBillingSettingValue(
    "default_currency",
    companyId,
    Boolean(companyId),
  );

  const currency =
    parseBillingSettingString(currencyQuery.data)?.toUpperCase() ||
    getCompanyCurrency() ||
    "USD";
  const language = profile?.preferred_language || i18n.language || "en";
  const timezone = profile?.timezone?.trim() || "UTC";
  const intlLocale = resolveIntlLocale(language);

  return useMemo((): CompanyLocale => {
    const formatCurrency = (amount: number, currencyOverride?: string) => {
      const code = currencyOverride || currency;
      try {
        return new Intl.NumberFormat(intlLocale, {
          style: "currency",
          currency: code,
          minimumFractionDigits: 2,
        }).format(Number(amount));
      } catch {
        return `${Number(amount).toFixed(2)} ${code}`;
      }
    };

    const formatMoney = (cents: number, currencyOverride?: string) =>
      formatCurrency(decimalFromCents(cents), currencyOverride);

    const formatDate = (value: string | Date | null | undefined, withTime = false) => {
      if (value == null || value === "") return "—";
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return "—";
      const opts: Intl.DateTimeFormatOptions = withTime
        ? { dateStyle: "medium", timeStyle: "short", timeZone: timezone }
        : { dateStyle: "medium", timeZone: timezone };
      try {
        return new Intl.DateTimeFormat(intlLocale, opts).format(date);
      } catch {
        return withTime ? date.toLocaleString() : date.toLocaleDateString();
      }
    };

    const formatNumber = (value: number, options?: Intl.NumberFormatOptions) => {
      try {
        return new Intl.NumberFormat(intlLocale, options).format(value);
      } catch {
        return String(value);
      }
    };

    return {
      currency,
      language,
      timezone,
      intlLocale,
      dateFormat: "medium",
      numberFormat: intlLocale,
      formatMoney,
      formatCurrency,
      formatDate,
      formatNumber,
      isLoading: Boolean(companyId) && currencyQuery.isLoading,
    };
  }, [
    companyId,
    currency,
    currencyQuery.isLoading,
    intlLocale,
    language,
    timezone,
  ]);
}
