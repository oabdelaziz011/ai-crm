import { createContext, useContext, useEffect, type ReactNode } from "react";
import {
  useCompanyLocale,
  type CompanyLocale,
} from "@/hooks/use-company-locale";
import { setCompanyLocaleRuntime } from "@/lib/company-locale/runtime";

const CompanyLocaleContext = createContext<CompanyLocale | null>(null);

/**
 * Syncs company currency / locale into React context + module runtime
 * so formatMoney / formatBillingCurrency pick up billing default_currency.
 */
export function CompanyLocaleProvider({ children }: { children: ReactNode }) {
  const locale = useCompanyLocale();

  useEffect(() => {
    setCompanyLocaleRuntime({
      currency: locale.currency,
      language: locale.language,
      timezone: locale.timezone,
      intlLocale: locale.intlLocale,
    });
  }, [locale.currency, locale.intlLocale, locale.language, locale.timezone]);

  return (
    <CompanyLocaleContext.Provider value={locale}>
      {children}
    </CompanyLocaleContext.Provider>
  );
}

/** Prefer this inside the dashboard shell (deduped via provider). */
export function useCompanyLocaleContext(): CompanyLocale {
  const ctx = useContext(CompanyLocaleContext);
  if (!ctx) {
    throw new Error("useCompanyLocaleContext must be used within CompanyLocaleProvider");
  }
  return ctx;
}
