import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { useCompanyLocaleContext } from "@/context/company-locale-context";
import { useAuth } from "@/context/auth-context";
import { useUpdateBillingSettings } from "@/hooks/billing/use-billing-settings";
import { useToast } from "@/hooks/use-toast";
import { setCompanyLocaleRuntime } from "@/lib/company-locale/runtime";
import {
  formatCurrencyOptionLabel,
  listOfficialCurrencies,
  normalizeCurrencyCode,
} from "@/lib/currency/catalog";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Company OPERATIONAL currency — Financial Settings / profile.
 * Writes company_financial_settings.default_currency (+ billing mirror for locale runtime).
 * Does NOT change ValueOR subscription billing currency.
 */
export function ProfileCurrencyField() {
  const { t, i18n } = useTranslation("common");
  const { toast } = useToast();
  const { company } = useAuth();
  const companyId = company?.id ?? null;
  const { currency } = useCompanyLocaleContext();
  const updateSettings = useUpdateBillingSettings();
  const qc = useQueryClient();
  const options = listOfficialCurrencies();

  const onChange = async (next: string) => {
    const code = normalizeCurrencyCode(next);
    if (!code || code === currency) return;

    const confirmed = window.confirm(t("profiles.currency.changeWarning"));
    if (!confirmed) return;

    // Immediate runtime + cache so money formatters update without refresh.
    setCompanyLocaleRuntime({ currency: code });
    void qc.setQueryData(["billing", "setting", "default_currency", companyId], code);
    void qc.setQueryData(["company-financial-settings", "default_currency", companyId], code);

    try {
      // Mirror into billing setting for locale runtime consumers.
      await updateSettings.mutateAsync({
        scopeType: companyId ? "company" : "platform",
        companyId: companyId,
        changes: { default_currency: code },
      });

      // Authoritative operational currency store.
      if (companyId) {
        const { error } = await supabase.from("company_financial_settings").upsert(
          {
            company_id: companyId,
            default_currency: code,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id" },
        );
        if (error) {
          console.warn("[profile-currency] financial settings sync failed", error.message);
        }
        void qc.invalidateQueries({ queryKey: ["company-financial-settings", "default_currency", companyId] });
        void qc.invalidateQueries({ queryKey: ["billing", "setting", "default_currency", companyId] });
      }

      toast({
        title: t("profiles.currency.saveSuccessTitle"),
        description: t("profiles.currency.saveSuccessDescription", { currency: code }),
      });
    } catch (error) {
      setCompanyLocaleRuntime({ currency });
      void qc.setQueryData(["billing", "setting", "default_currency", companyId], currency);
      void qc.setQueryData(["company-financial-settings", "default_currency", companyId], currency);
      toast({
        title: t("profiles.currency.saveFailedTitle"),
        description: error instanceof Error ? error.message : t("profiles.currency.saveFailedDescription"),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="profile-currency">{t("profiles.fields.currency")}</Label>
      <select
        id="profile-currency"
        className="w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary/40"
        value={currency}
        disabled={updateSettings.isPending}
        onChange={(event) => void onChange(event.target.value)}
      >
        {!options.some((entry) => entry.code === currency) && currency ? (
          <option value={currency}>{formatCurrencyOptionLabel(currency, i18n.language)}</option>
        ) : null}
        {options.map((entry) => (
          <option key={entry.code} value={entry.code}>
            {formatCurrencyOptionLabel(entry.code, i18n.language)}
          </option>
        ))}
      </select>
      <p className="text-[11px] text-muted-foreground">{t("profiles.currency.hint")}</p>
      <p className="text-[11px] text-muted-foreground">{t("profiles.currency.subscriptionIndependent")}</p>
    </div>
  );
}
