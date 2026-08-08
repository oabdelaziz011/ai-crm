/**
 * Module-level locale defaults synced by CompanyLocaleProvider.
 * Lets non-React formatters (formatMoney, formatBillingCurrency) use company currency
 * without threading props through every call site.
 */

export type CompanyLocaleRuntime = {
  currency: string;
  language: string;
  timezone: string;
  /** BCP 47 locale for Intl (e.g. en-US, ar-SA). */
  intlLocale: string;
};

const DEFAULTS: CompanyLocaleRuntime = {
  currency: "USD",
  language: "en",
  timezone: "UTC",
  intlLocale: "en",
};

let runtime: CompanyLocaleRuntime = { ...DEFAULTS };

export function setCompanyLocaleRuntime(next: Partial<CompanyLocaleRuntime>): void {
  runtime = {
    currency: next.currency?.trim() || runtime.currency || DEFAULTS.currency,
    language: next.language?.trim() || runtime.language || DEFAULTS.language,
    timezone: next.timezone?.trim() || runtime.timezone || DEFAULTS.timezone,
    intlLocale: next.intlLocale?.trim() || runtime.intlLocale || DEFAULTS.intlLocale,
  };
}

export function getCompanyLocaleRuntime(): CompanyLocaleRuntime {
  return runtime;
}

export function getCompanyCurrency(): string {
  return runtime.currency || DEFAULTS.currency;
}

export function getCompanyIntlLocale(): string {
  return runtime.intlLocale || DEFAULTS.intlLocale;
}

export function getCompanyTimezone(): string {
  return runtime.timezone || DEFAULTS.timezone;
}

export function resolveIntlLocale(language: string | null | undefined): string {
  const lang = (language ?? "en").toLowerCase();
  if (lang.startsWith("ar")) return "ar-SA";
  if (lang.startsWith("en")) return "en-US";
  return lang;
}
