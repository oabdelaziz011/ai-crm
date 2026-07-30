import { useTranslation } from "react-i18next";
import type { AiCapabilityCatalogSummary } from "@/lib/platform-ai/ai-capability-catalog-schema";
import { CompanyStatusBadge } from "./company-status-badge";

type CompanyAiSummaryPanelProps = {
  companyName: string;
  companyStatus: import("@/lib/types").CompanyStatus;
  summary: AiCapabilityCatalogSummary;
};

function formatLastUpdated(value: string | null, locale: string): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function CompanyAiSummaryPanel({
  companyName,
  companyStatus,
  summary,
}: CompanyAiSummaryPanelProps) {
  const { t, i18n } = useTranslation("common");

  const statItems = [
    {
      label: t("platformAi.admin.companySummary.aiStatus"),
      value: t(summary.statusKey),
    },
    {
      label: t("platformAi.admin.companySummary.plan"),
      value: summary.planLabel ?? t("platformAi.admin.companySummary.planUnavailable"),
    },
    {
      label: t("platformAi.admin.companySummary.liveFeatures"),
      value: String(summary.liveFeatureCount),
    },
    {
      label: t("platformAi.admin.companySummary.lockedFeatures"),
      value: String(summary.lockedFeatureCount),
    },
    {
      label: t("platformAi.admin.companySummary.comingSoonFeatures"),
      value: String(summary.comingSoonCount),
    },
    {
      label: t("platformAi.admin.companySummary.betaFeatures"),
      value: String(summary.betaCount),
    },
    {
      label: t("platformAi.admin.companySummary.lastUpdated"),
      value: summary.lastUpdatedAt
        ? formatLastUpdated(summary.lastUpdatedAt, i18n.language)
        : t("platformAi.admin.companySummary.neverUpdated"),
    },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-background/30 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium">{companyName}</h3>
          <CompanyStatusBadge status={companyStatus} />
        </div>
        <span
          className={`text-xs font-mono px-2.5 py-1 rounded-full border ${
            summary.enabledFeatureCount > 0
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-muted-foreground/30 bg-muted/20 text-muted-foreground"
          }`}
        >
          {t(summary.statusKey)}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statItems.map((item) => (
          <div key={item.label} className="rounded-lg border border-white/5 px-3 py-2.5">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-sm font-medium">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
