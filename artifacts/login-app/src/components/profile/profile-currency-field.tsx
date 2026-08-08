import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { useCompanyLocaleContext } from "@/context/company-locale-context";
import { useAuth } from "@/context/auth-context";
import { useUpdateBillingSettings } from "@/hooks/billing/use-billing-settings";
import { useToast } from "@/hooks/use-toast";
import { setCompanyLocaleRuntime } from "@/lib/company-locale/runtime";
import { useQueryClient } from "@tanstack/react-query";

const PROFILE_CURRENCY_OPTIONS = ["SAR", "EGP", "USD", "AED", "EUR", "GBP"] as const;

/** Company default currency — writes billing `default_currency` (CompanyLocaleProvider source). */
export function ProfileCurrencyField() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { company } = useAuth();
  const companyId = company?.id ?? null;
  const { currency } = useCompanyLocaleContext();
  const updateSettings = useUpdateBillingSettings();
  const qc = useQueryClient();

  const onChange = async (next: string) => {
    const code = next.trim().toUpperCase();
    if (!code || code === currency) return;

    // Immediate runtime + cache so money formatters update without refresh.
    setCompanyLocaleRuntime({ currency: code });
    void qc.setQueryData(["billing", "setting", "default_currency", companyId], code);

    try {
      // `default_currency` allows company + platform scopes (billing definitions).
      await updateSettings.mutateAsync({
        scopeType: companyId ? "company" : "platform",
        companyId: companyId,
        changes: { default_currency: code },
      });
      toast({
        title: t("profiles.currency.saveSuccessTitle"),
        description: t("profiles.currency.saveSuccessDescription", { currency: code }),
      });
    } catch (error) {
      setCompanyLocaleRuntime({ currency });
      void qc.setQueryData(["billing", "setting", "default_currency", companyId], currency);
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
        {!PROFILE_CURRENCY_OPTIONS.includes(currency as (typeof PROFILE_CURRENCY_OPTIONS)[number]) && (
          <option value={currency}>{currency}</option>
        )}
        {PROFILE_CURRENCY_OPTIONS.map((code) => (
          <option key={code} value={code}>
            {t(`operations.currency.${code}`, { defaultValue: code })}
          </option>
        ))}
      </select>
      <p className="text-[11px] text-muted-foreground">{t("profiles.currency.hint")}</p>
    </div>
  );
}
