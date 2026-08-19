import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useConfigureCompanyCustomPackage } from "@/hooks/billing/use-billing-edit";
import { useCompanyEntitlements } from "@/hooks/billing/use-company-entitlements";
import { useCompanyResourceOccupancy } from "@/hooks/billing/use-company-resource-occupancy";
import {
  useCompanyCommercialTerms,
  useCompanyUsageLimitOverrides,
  useUsageMetricDefinitions,
} from "@/hooks/companies/use-company-commercial-terms";
import { supabase } from "@/lib/supabase";
import { formatBillingCurrency } from "@/lib/billing/format";
import { fetchCompanyCurrentPeriodUsage } from "@/lib/billing/fetch-current-period-usage";
import { isCommercialEntitlement } from "@/lib/billing/entitlement-display";
import { sanitizeCompanyCommercialError } from "@/lib/companies/company-lifecycle-errors";
import type { CompanySubscription } from "@/lib/billing/types";
import {
  CUSTOM_FEATURE_GROUPS,
  PERIODIC_QUOTA_METRIC_CODES,
  isOverLimit,
  localizedFeatureLabel,
  parseNonNegativeNumber,
  quotaControlKind,
  remainingFromLimit,
} from "@/lib/billing/custom-package-config";

type PanelProps = {
  companyId: string;
  subscription: CompanySubscription;
  onCancel: () => void;
  onSuccess: (result: Record<string, unknown>) => void;
  onError: (message: string) => void;
};

type LimitDraft = { unlimited: boolean; value: string };

export function BillingCustomPackagePanel({
  companyId,
  subscription,
  onCancel,
  onSuccess,
  onError,
}: PanelProps) {
  const { t } = useTranslation("common");
  const saveMutation = useConfigureCompanyCustomPackage();
  const entitlementsQuery = useCompanyEntitlements(companyId, true);
  const occupancyQuery = useCompanyResourceOccupancy(companyId, true);
  const termsQuery = useCompanyCommercialTerms(companyId, true);
  const overridesQuery = useCompanyUsageLimitOverrides(companyId, true);
  const metricsQuery = useUsageMetricDefinitions(true);

  const [packageName, setPackageName] = useState("");
  const [notes, setNotes] = useState("");
  const [cycle, setCycle] = useState<"monthly" | "yearly">(
    subscription.billing_cycle === "yearly" ? "yearly" : "monthly",
  );
  const [monthlyPrice, setMonthlyPrice] = useState("0");
  const [yearlyPrice, setYearlyPrice] = useState("0");
  const [enabledCodes, setEnabledCodes] = useState<Set<string>>(new Set());
  const [userLimit, setUserLimit] = useState<LimitDraft>({ unlimited: true, value: "" });
  const [branchLimit, setBranchLimit] = useState<LimitDraft>({ unlimited: false, value: "1" });
  const [quotaDrafts, setQuotaDrafts] = useState<Record<string, LimitDraft>>({});
  const [usageByMetric, setUsageByMetric] = useState<Record<string, number>>({});
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    const terms = termsQuery.data;
    if (!terms) return;
    setPackageName(terms.custom_package_name ?? "");
    setNotes(terms.notes ?? "");
    if (terms.custom_price_monthly != null) setMonthlyPrice(String(terms.custom_price_monthly));
    if (terms.custom_price_yearly != null) setYearlyPrice(String(terms.custom_price_yearly));
  }, [termsQuery.data]);

  useEffect(() => {
    setEnabledCodes(
      new Set(
        (entitlementsQuery.data ?? [])
          .filter((row) => isCommercialEntitlement(row) && row.enabled)
          .map((row) => row.feature_code),
      ),
    );
  }, [entitlementsQuery.data]);

  useEffect(() => {
    const occupancy = occupancyQuery.data;
    if (!occupancy) return;
    setUserLimit({
      unlimited: Boolean(occupancy.users.is_unlimited || occupancy.users.max_allowed == null),
      value: occupancy.users.max_allowed == null ? "" : String(occupancy.users.max_allowed),
    });
    setBranchLimit({
      unlimited: Boolean(occupancy.branches.is_unlimited || occupancy.branches.max_allowed == null),
      value: occupancy.branches.max_allowed == null ? "" : String(occupancy.branches.max_allowed),
    });
  }, [occupancyQuery.data]);

  useEffect(() => {
    const next: Record<string, LimitDraft> = {};
    for (const code of PERIODIC_QUOTA_METRIC_CODES) {
      const match = (overridesQuery.data ?? []).find((row) => {
        const rec = row as unknown as Record<string, unknown>;
        return String(rec.metric_code ?? rec.metric_code ?? "") === code;
      }) as unknown as Record<string, unknown> | undefined;
      next[code] = {
        unlimited: Boolean(match?.is_unlimited ?? match?.is_unlimited),
        value: String(match?.included_quantity ?? match?.included_quantity ?? ""),
      };
    }
    setQuotaDrafts(next);
  }, [overridesQuery.data]);

  useEffect(() => {
    let cancelled = false;
    void fetchCompanyCurrentPeriodUsage(supabase, companyId)
      .then((rows) => {
        if (!cancelled) setUsageByMetric(rows);
      })
      .catch(() => {
        if (!cancelled) setUsageByMetric({});
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const commercialFeatures = useMemo(
    () => (entitlementsQuery.data ?? []).filter((row) => isCommercialEntitlement(row)),
    [entitlementsQuery.data],
  );

  function toggleFeature(code: string) {
    setEnabledCodes((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function buildPayload() {
    const name = packageName.trim();
    if (!name) throw new Error(t("companies.changePackage.customNameRequired"));
    const monthly = parseNonNegativeNumber(monthlyPrice);
    const yearly = parseNonNegativeNumber(yearlyPrice);
    if (monthly == null || yearly == null) throw new Error(t("companies.changePackage.invalidPrice"));
    const maxUsers = userLimit.unlimited ? null : parseNonNegativeNumber(userLimit.value);
    const maxBranches = branchLimit.unlimited ? null : parseNonNegativeNumber(branchLimit.value);
    if (!userLimit.unlimited && maxUsers == null) throw new Error(t("companies.changePackage.invalidUserLimit"));
    if (!branchLimit.unlimited && maxBranches == null) {
      throw new Error(t("companies.changePackage.invalidBranchLimit"));
    }
    const knownMetrics = new Set((metricsQuery.data ?? []).map((row) => row.code));
    const usageLimits = PERIODIC_QUOTA_METRIC_CODES.filter((code) => knownMetrics.has(code)).map((code) => {
      const metric = (metricsQuery.data ?? []).find((row) => row.code === code);
      const kind = quotaControlKind({
        code,
        aggregationType: (metric as { aggregation_type?: string } | undefined)?.aggregation_type,
        billable: metric?.billable,
      });
      const draft = quotaDrafts[code] ?? { unlimited: false, value: "" };
      if (kind === "informational") {
        return { metric_code: code, included_quantity: null, is_unlimited: false };
      }
      return {
        metric_code: code,
        included_quantity: draft.unlimited ? null : parseNonNegativeNumber(draft.value),
        is_unlimited: draft.unlimited,
      };
    });
    return {
      companyId,
      packageName: name,
      billingCycle: cycle,
      customPriceMonthly: monthly,
      customPriceYearly: yearly,
      notes: notes.trim() || null,
      featureCodes: [...enabledCodes],
      maxUsers,
      maxBranches,
      usageLimits,
    };
  }

  async function handleSave() {
    try {
      const payload = buildPayload();
      if (!showSummary) {
        setShowSummary(true);
        return;
      }
      const result = await saveMutation.mutateAsync(payload);
      onSuccess(result);
    } catch (error) {
      onError(sanitizeCompanyCommercialError(error, t("companies.changePackage.saveFailed")));
    }
  }

  const usersUsed = occupancyQuery.data?.users.current_count ?? 0;
  const branchesUsed = occupancyQuery.data?.branches.current_count ?? 0;

  return (
    <div className="space-y-5">
      <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        {t("companies.changePackage.noPayment")}
      </p>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t("companies.changePackage.packageInfo")}</h3>
        <label className="block text-sm">
          <span className="text-muted-foreground">{t("companies.changePackage.customName")}</span>
          <Input className="mt-1" value={packageName} onChange={(event) => setPackageName(event.target.value)} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-muted-foreground">{t("companies.changePackage.priceMonthly")}</span>
            <Input className="mt-1" inputMode="decimal" value={monthlyPrice} onChange={(event) => setMonthlyPrice(event.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">{t("companies.changePackage.priceYearly")}</span>
            <Input className="mt-1" inputMode="decimal" value={yearlyPrice} onChange={(event) => setYearlyPrice(event.target.value)} />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-muted-foreground">{t("companies.changePackage.billingCycle")}</span>
          <select
            className="mt-1 w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
            value={cycle}
            onChange={(event) => setCycle(event.target.value === "yearly" ? "yearly" : "monthly")}
          >
            <option value="monthly">{t("companies.changePackage.monthly")}</option>
            <option value="yearly">{t("companies.changePackage.yearly")}</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">{t("companies.changePackage.adminNotes")}</span>
          <Textarea className="mt-1" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t("companies.changePackage.features")}</h3>
        {CUSTOM_FEATURE_GROUPS.map((group) => {
          const rows = commercialFeatures.filter((row) => (group.codes as readonly string[]).includes(row.feature_code));
          if (rows.length === 0) return null;
          return (
            <div key={group.id} className="space-y-2 rounded-lg border border-border/50 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                {t(`companies.changePackage.featureGroups.${group.id}`)}
              </p>
              {rows.map((row) => (
                <label key={row.feature_code} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={enabledCodes.has(row.feature_code)}
                    onChange={() => toggleFeature(row.feature_code)}
                  />
                  <span>
                    {localizedFeatureLabel(t, row.feature_code, row.label)}
                  </span>
                </label>
              ))}
            </div>
          );
        })}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t("companies.changePackage.resourceLimits")}</h3>
        <LimitEditor
          label={t("companies.changePackage.users")}
          used={usersUsed}
          draft={userLimit}
          onChange={setUserLimit}
          t={t}
        />
        <LimitEditor
          label={t("companies.changePackage.branches")}
          used={branchesUsed}
          draft={branchLimit}
          onChange={setBranchLimit}
          t={t}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t("companies.changePackage.usageLimits")}</h3>
        {PERIODIC_QUOTA_METRIC_CODES.filter((code) => (metricsQuery.data ?? []).some((row) => row.code === code)).map(
          (code) => {
            const metric = (metricsQuery.data ?? []).find((row) => row.code === code);
            const kind = quotaControlKind({
              code,
              aggregationType: (metric as { aggregation_type?: string } | undefined)?.aggregation_type,
              billable: metric?.billable,
            });
            const draft = quotaDrafts[code] ?? { unlimited: false, value: "" };
            return (
              <LimitEditor
                key={code}
                label={t(`companies.changePackage.metrics.${code}`, { defaultValue: metric?.label ?? code })}
                used={usageByMetric[code] ?? 0}
                draft={draft}
                onChange={(next) => setQuotaDrafts((current) => ({ ...current, [code]: next }))}
                t={t}
                informational={kind === "informational"}
              />
            );
          },
        )}
      </section>

      {showSummary ? (
        <div className="space-y-1 rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
          <p className="font-medium">{t("companies.changePackage.summaryTitle")}</p>
          <p>
            {t("companies.changePackage.newPackage")}: {packageName || t("companies.changePackage.customPackage")}
          </p>
          <p>
            {t("companies.changePackage.price")}:{" "}
            {formatBillingCurrency(Number(cycle === "yearly" ? yearlyPrice : monthlyPrice))} /{" "}
            {cycle === "yearly" ? t("companies.changePackage.yearly") : t("companies.changePackage.monthly")}
          </p>
          <p>
            {t("companies.changePackage.features")}: {enabledCodes.size}
          </p>
          <p>
            {t("companies.changePackage.users")}:{" "}
            {userLimit.unlimited ? t("companies.changePackage.unlimited") : userLimit.value}
          </p>
          <p>
            {t("companies.changePackage.branches")}:{" "}
            {branchLimit.unlimited ? t("companies.changePackage.unlimited") : branchLimit.value}
          </p>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={saveMutation.isPending}
          onClick={() => {
            if (showSummary) setShowSummary(false);
            else onCancel();
          }}
        >
          {t("companies.changePackage.cancel")}
        </Button>
        <Button type="button" disabled={saveMutation.isPending} onClick={() => void handleSave()}>
          {saveMutation.isPending
            ? t("billing.common.loading")
            : showSummary
              ? t("companies.changePackage.save")
              : t("companies.changePackage.review")}
        </Button>
      </div>
    </div>
  );
}

function LimitEditor({
  label,
  used,
  draft,
  onChange,
  t,
  informational = false,
}: {
  label: string;
  used: number;
  draft: LimitDraft;
  onChange: (next: LimitDraft) => void;
  t: (key: string, options?: Record<string, string>) => string;
  informational?: boolean;
}) {
  const remaining = remainingFromLimit(used, draft.unlimited ? null : Number(draft.value), draft.unlimited);
  const over = isOverLimit(used, draft.unlimited ? null : Number(draft.value), draft.unlimited);
  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg border border-border/40 p-2 text-sm sm:grid-cols-4">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">
        {t("companies.changePackage.currentUsage")}: {used}
      </p>
      {informational ? (
        <p className="text-muted-foreground">{t("companies.changePackage.informationalMetric")}</p>
      ) : (
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={draft.unlimited}
              onChange={(event) => onChange({ ...draft, unlimited: event.target.checked })}
            />
            {t("companies.changePackage.unlimited")}
          </label>
          {draft.unlimited ? null : (
            <Input
              className="h-8"
              inputMode="numeric"
              value={draft.value}
              onChange={(event) => onChange({ ...draft, value: event.target.value })}
            />
          )}
        </div>
      )}
      <p className={over ? "text-amber-700" : "text-muted-foreground"}>
        {t("companies.changePackage.remaining")}: {remaining == null ? "—" : remaining}
        {over ? ` · ${t("companies.changePackage.overLimit")}` : ""}
      </p>
    </div>
  );
}
