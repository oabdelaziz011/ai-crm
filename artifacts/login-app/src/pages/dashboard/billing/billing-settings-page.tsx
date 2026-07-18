import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BillingEmptyState } from "@/components/billing/ui/billing-empty-state";
import { DashboardCard, DashboardErrorBanner, DashboardTableSkeleton } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { useBillingSettingsByCategory, useUpdateBillingSettings } from "@/hooks/billing/use-billing-settings";
import { useToast } from "@/hooks/use-toast";
import { useAuthUser } from "@/hooks/use-rbac";
import { canEditBillingSettings, canViewBillingSettings } from "@/lib/billing/billing-permissions";
import { parseSupportedPaymentMethodCodes } from "@/lib/billing/settings-runtime";
import { validateBillingSettingDraft } from "@/lib/billing/settings-validation";
import type { BillingSettingCategory, BillingSettingRow } from "@/lib/billing/types";

const TABS: BillingSettingCategory[] = [
  "general",
  "subscription",
  "documents",
  "branding",
  "payments",
  "communications",
  "webhooks",
  "usage",
  "health",
  "entitlements",
];

const PAYMENT_METHOD_CODES = [
  "visa",
  "mastercard",
  "meeza",
  "apple_pay",
  "google_pay",
  "paypal",
  "stripe",
  "paymob",
  "fawry",
  "manual",
] as const;

function parseSettingValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value);
}

function toStoredValue(raw: string, valueType: string): unknown {
  if (valueType === "boolean") return raw === "true";
  if (valueType === "integer") return Number.parseInt(raw, 10);
  if (valueType === "decimal") return Number.parseFloat(raw);
  if (valueType === "json") {
    return JSON.parse(raw);
  }
  return raw;
}

function settingFieldKey(code: string, part: "label" | "description" | "tooltip") {
  return `billing.settings.fields.${code}.${part}`;
}

export function BillingSettingsPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canView = canViewBillingSettings(hasPermission, isSuperAdmin);
  const canEdit = canEditBillingSettings(hasPermission, isSuperAdmin);
  const [activeTab, setActiveTab] = useState<BillingSettingCategory>("general");
  const { data: rows = [], isLoading, error } = useBillingSettingsByCategory(activeTab, "platform", null, canView);
  const updateSettings = useUpdateBillingSettings();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const mergedRows = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        inputValue: draft[row.code] ?? parseSettingValue(row.value),
      })),
    [rows, draft],
  );

  const translateValidation = (key: string, options?: Record<string, unknown>) => t(key, options);

  const updateDraft = (code: string, value: string) => {
    setDraft((prev) => ({ ...prev, [code]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[code];
      return next;
    });
  };

  const renderPaymentMethodsEditor = (row: BillingSettingRow & { inputValue: string }) => {
    const selected = new Set(parseSupportedPaymentMethodCodes(row.inputValue));
    return (
      <div className="grid gap-2 sm:grid-cols-2 max-w-xl">
        {PAYMENT_METHOD_CODES.map((code) => {
          const checked = selected.has(code);
          return (
            <label key={code} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={checked}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(code);
                  else next.delete(code);
                  updateDraft(row.code, JSON.stringify([...next]));
                }}
              />
              <span>{t(`billing.settings.paymentMethods.${code}`)}</span>
            </label>
          );
        })}
      </div>
    );
  };

  const renderFieldEditor = (row: BillingSettingRow & { inputValue: string }) => {
    if (row.code === "supported_payment_method_codes") {
      return renderPaymentMethodsEditor(row);
    }

    if (row.value_type === "boolean") {
      return (
        <select
          disabled={!canEdit}
          value={row.inputValue === "true" ? "true" : "false"}
          onChange={(e) => updateDraft(row.code, e.target.value)}
          className="rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm max-w-xs"
        >
          <option value="true">{t("billing.common.yes")}</option>
          <option value="false">{t("billing.common.no")}</option>
        </select>
      );
    }

    if (row.value_type === "json") {
      return (
        <textarea
          disabled={!canEdit}
          rows={4}
          value={row.inputValue}
          onChange={(e) => updateDraft(row.code, e.target.value)}
          className="rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm font-mono"
        />
      );
    }

    if (row.value_type === "integer" || row.value_type === "decimal") {
      return (
        <input
          type="number"
          step={row.value_type === "decimal" ? "0.01" : "1"}
          disabled={!canEdit}
          value={row.inputValue}
          onChange={(e) => updateDraft(row.code, e.target.value)}
          className="rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm max-w-xs"
        />
      );
    }

    if (row.value_type === "template_ref") {
      return (
        <input
          disabled={!canEdit}
          value={row.inputValue}
          placeholder={t("billing.settings.templateRefPlaceholder")}
          onChange={(e) => updateDraft(row.code, e.target.value)}
          className="rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm font-mono"
        />
      );
    }

    return (
      <input
        disabled={!canEdit}
        value={row.inputValue}
        onChange={(e) => updateDraft(row.code, e.target.value)}
        className="rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
      />
    );
  };

  if (!canView) {
    return <p className="text-sm text-muted-foreground">{t("billing.settings.noPermission")}</p>;
  }

  const handleSave = async () => {
    const nextErrors: Record<string, string> = {};
    const changes: Record<string, unknown> = {};

    for (const row of mergedRows) {
      if (draft[row.code] === undefined) continue;

      const validationError = validateBillingSettingDraft(row, draft[row.code], translateValidation);
      if (validationError) {
        nextErrors[row.code] = validationError;
        continue;
      }

      try {
        changes[row.code] = toStoredValue(draft[row.code], row.value_type);
      } catch {
        nextErrors[row.code] = t("billing.settings.validation.invalidJson");
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      toast({
        variant: "destructive",
        title: t("billing.toast.errorTitle"),
        description: t("billing.settings.validation.fixErrors"),
      });
      return;
    }

    if (Object.keys(changes).length === 0) return;

    try {
      await updateSettings.mutateAsync({
        scopeType: "platform",
        companyId: null,
        changes,
      });
      setDraft({});
      setFieldErrors({});
      toast({
        title: t("billing.toast.successTitle"),
        description: t("billing.settings.saveSuccess"),
      });
    } catch (saveError) {
      toast({
        variant: "destructive",
        title: t("billing.toast.errorTitle"),
        description: saveError instanceof Error ? saveError.message : t("billing.settings.saveFailed"),
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("billing.settings.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("billing.settings.subtitle")}</p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-muted-foreground">
          {t("billing.settings.platformScope")}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setActiveTab(tab);
              setDraft({});
              setFieldErrors({});
            }}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              activeTab === tab
                ? "bg-primary/15 text-primary border border-primary/20"
                : "text-muted-foreground hover:bg-white/5 border border-transparent"
            }`}
          >
            {t(`billing.settings.tabs.${tab}`)}
          </button>
        ))}
      </div>

      {error ? <DashboardErrorBanner message={error.message} /> : null}

      <DashboardCard className="overflow-hidden">
        {isLoading ? (
          <div className="p-5">
            <DashboardTableSkeleton rows={6} />
          </div>
        ) : mergedRows.length === 0 ? (
          <BillingEmptyState
            title={t("billing.settings.empty")}
            description={t("billing.settings.emptyHint")}
          />
        ) : (
          <div className="divide-y divide-white/5">
            {mergedRows.map((row) => (
              <div key={row.code} className="grid gap-4 p-5 lg:grid-cols-[280px_1fr] lg:items-start">
                <div>
                  <p className="text-sm font-medium">{t(settingFieldKey(row.code, "label"))}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(settingFieldKey(row.code, "description"))}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">{t(settingFieldKey(row.code, "tooltip"))}</p>
                  <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t(`billing.settings.valueTypes.${row.value_type}`)}
                  </p>
                </div>
                <div className="space-y-2">
                  {renderFieldEditor(row)}
                  {fieldErrors[row.code] ? (
                    <p className="text-xs text-destructive">{fieldErrors[row.code]}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {canEdit && mergedRows.length > 0 ? (
          <div className="border-t border-white/5 p-4">
            <Button onClick={handleSave} disabled={updateSettings.isPending || Object.keys(draft).length === 0}>
              {updateSettings.isPending ? t("billing.settings.saving") : t("billing.settings.save")}
            </Button>
          </div>
        ) : null}
      </DashboardCard>
    </div>
  );
}
