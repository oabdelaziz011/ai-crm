import { Gauge } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BillingEmptyState } from "@/components/billing/ui/billing-empty-state";
import { DashboardCard } from "@/components/dashboard/ui";
import { useCompanyUsageSnapshot } from "@/hooks/billing/use-company-entitlements";
import { formatBillingUnit } from "@/lib/billing/billing-display-i18n";
import type { CompanySubscription } from "@/lib/billing/types";

type UsageSummaryPanelProps = {
  subscription: CompanySubscription;
  enabled?: boolean;
};

function UsageMeter({
  label,
  used,
  limit,
  unitKey,
  t,
}: {
  label: string;
  used: number;
  limit: number | null;
  unitKey: "mb" | "none";
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null;
  const formatValue = (value: number) =>
    unitKey === "mb" ? formatBillingUnit(t, value, "mb") : value.toLocaleString();

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {formatValue(used)}
          {limit != null ? ` / ${formatValue(limit)}` : ""}
        </span>
      </div>
      {pct != null ? (
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function hasRecordedUsage(metrics: Record<string, unknown> | undefined): boolean {
  if (!metrics) return false;
  const ai = Number(metrics.ai_tokens ?? 0);
  const storage = Number(metrics.storage_bytes ?? 0);
  const api = Number(metrics.api_calls ?? 0);
  return ai > 0 || storage > 0 || api > 0;
}

export function UsageSummaryPanel({ subscription, enabled = true }: UsageSummaryPanelProps) {
  const { t } = useTranslation("common");
  const { data: usageSnapshot, isLoading, error } = useCompanyUsageSnapshot(subscription.company_id, enabled);

  const recordedUsage = hasRecordedUsage(usageSnapshot?.metrics as Record<string, unknown> | undefined);
  const aiUsed = Number(usageSnapshot?.metrics?.ai_tokens ?? 0);
  const storageUsedMb = Math.round(Number(usageSnapshot?.metrics?.storage_bytes ?? 0) / (1024 * 1024));
  const storageLimitGb = subscription.plan?.storage_gb ?? null;
  const storageLimitMb = storageLimitGb != null ? storageLimitGb * 1024 : null;

  return (
    <DashboardCard className="overflow-hidden">
      <div className="border-b border-white/5 p-5">
        <h2 className="font-semibold">{t("billing.detail.usageSummary")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("billing.detail.usageSummaryHint")}</p>
      </div>

      {error ? (
        <p className="p-4 text-sm text-destructive">{error.message}</p>
      ) : isLoading ? (
        <div className="space-y-3 p-5">
          <div className="h-16 animate-pulse rounded-xl bg-white/10" />
          <div className="h-16 animate-pulse rounded-xl bg-white/10" />
        </div>
      ) : !usageSnapshot || !recordedUsage ? (
        <BillingEmptyState
          title={t("billing.detail.emptyStates.usageNoneRecorded")}
          description={t("billing.detail.emptyStates.usageNoneRecordedHint")}
          icon={Gauge}
        />
      ) : (
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <UsageMeter
            label={t("billing.detail.aiTokensUsed")}
            used={aiUsed}
            limit={subscription.plan?.ai_tokens_monthly ?? null}
            unitKey="none"
            t={t}
          />
          <UsageMeter
            label={t("billing.detail.storageUsed")}
            used={storageUsedMb}
            limit={storageLimitMb}
            unitKey="mb"
            t={t}
          />
        </div>
      )}
    </DashboardCard>
  );
}
