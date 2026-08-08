import type { ReactNode } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DailyUsageBars,
  InfoField,
  OverviewSection,
  StatusPill,
} from "@/components/company-workspace/overview/overview-ui";
import { formatBillingCurrency, formatBillingDate } from "@/lib/billing/format";
import type {
  AiQuotaTone,
  ExecutiveAiUsageMetrics,
  NamedUsage,
} from "@/lib/company-workspace/executive-ai-usage";
import { cn } from "@/lib/utils";

type Props = {
  metrics: ExecutiveAiUsageMetrics | null;
  isLoading?: boolean;
};

function Metric({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="rounded-xl border border-border/50 bg-muted/15 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function SubSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function heroBarClass(tone: AiQuotaTone | null): string {
  if (tone === "over") return "bg-red-800 dark:bg-red-900";
  if (tone === "high") return "bg-red-500";
  if (tone === "warn") return "bg-orange-500";
  if (tone === "mid") return "bg-blue-500";
  if (tone === "ok") return "bg-success";
  return "bg-primary";
}

function QuotaHero({ metrics }: { metrics: ExecutiveAiUsageMetrics }) {
  const { t } = useTranslation("common");
  if (metrics.monthlyQuota == null || metrics.quotaPctRaw == null) return null;

  const barWidth = Math.min(100, Math.max(0, metrics.quotaPct ?? 0));

  return (
    <div className="rounded-xl border border-border/50 bg-muted/10 p-4 md:p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-center">
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <span className="text-3xl font-semibold tabular-nums tracking-tight">
              {`${Math.round(metrics.quotaPctRaw)}%`}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {t("companyWorkspace.overview.aiUsage.tokensOf", {
                used: metrics.used.toLocaleString(),
                limit: metrics.monthlyQuota.toLocaleString(),
              })}
            </span>
          </div>
          <div className="h-4 overflow-hidden rounded-full bg-muted/50">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                heroBarClass(metrics.tone),
              )}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Metric
            label={t("companyWorkspace.overview.aiUsage.used")}
            value={metrics.used.toLocaleString()}
          />
          <Metric
            label={t("companyWorkspace.overview.aiUsage.remaining")}
            value={
              metrics.remaining != null ? metrics.remaining.toLocaleString() : null
            }
          />
          <Metric
            label={t("companyWorkspace.overview.aiUsage.totalQuota")}
            value={metrics.monthlyQuota.toLocaleString()}
          />
        </div>
      </div>
    </div>
  );
}

function ModelRankList({
  title,
  items,
  currency,
}: {
  title: string;
  items: NamedUsage[];
  currency: string;
}) {
  const { t } = useTranslation("common");
  if (!items.length) return null;
  const max = Math.max(...items.map((i) => i.tokens), 1);

  return (
    <SubSection title={title}>
      <ul className="space-y-2.5">
        {items.map((item) => (
          <li
            key={item.key}
            className="rounded-xl border border-border/50 bg-muted/10 px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium text-foreground">{item.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {item.tokens.toLocaleString()}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted/50">
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${Math.max(4, Math.round((item.tokens / max) * 100))}%`,
                }}
              />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              {item.usagePct != null ? (
                <span>
                  {t("companyWorkspace.overview.aiCommand.usagePct", {
                    pct: item.usagePct,
                  })}
                </span>
              ) : null}
              {item.costPct != null ? (
                <span>
                  {t("companyWorkspace.overview.aiCommand.costPct", {
                    pct: item.costPct,
                  })}
                </span>
              ) : null}
              {item.cost != null && item.cost > 0 ? (
                <span className="tabular-nums">
                  {formatBillingCurrency(item.cost, currency)}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </SubSection>
  );
}

function FeatureRankList({ title, items }: { title: string; items: NamedUsage[] }) {
  if (!items.length) return null;
  const max = Math.max(...items.map((i) => i.tokens), 1);

  return (
    <SubSection title={title}>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium text-foreground">{item.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {item.tokens.toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted/50">
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${Math.max(4, Math.round((item.tokens / max) * 100))}%`,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </SubSection>
  );
}

export function AiCommandCenterCard({ metrics, isLoading }: Props) {
  const { t } = useTranslation("common");
  const showConnected = Boolean(metrics?.hasUsage);

  const consumptionItems = metrics
    ? [
        {
          label: t("companyWorkspace.overview.aiCommand.tokensToday"),
          value:
            metrics.tokensToday != null
              ? metrics.tokensToday.toLocaleString()
              : null,
        },
        {
          label: t("companyWorkspace.overview.aiCommand.tokensYesterday"),
          value:
            metrics.tokensYesterday != null
              ? metrics.tokensYesterday.toLocaleString()
              : null,
        },
        {
          label: t("companyWorkspace.overview.aiCommand.average7Day"),
          value:
            metrics.average7DayTokens != null
              ? metrics.average7DayTokens.toLocaleString()
              : null,
        },
        {
          label: t("companyWorkspace.overview.aiCommand.average30Day"),
          value:
            metrics.average30DayTokens != null
              ? metrics.average30DayTokens.toLocaleString()
              : null,
        },
        {
          label: t("companyWorkspace.overview.aiUsage.averageTokens"),
          value:
            metrics.averageTokensPerRequest != null
              ? metrics.averageTokensPerRequest.toLocaleString()
              : null,
        },
        {
          label: t("companyWorkspace.overview.aiUsage.averageDaily"),
          value:
            metrics.averageDailyTokens != null
              ? metrics.averageDailyTokens.toLocaleString()
              : null,
        },
      ].filter((item) => item.value != null)
    : [];

  const forecastItems = metrics
    ? [
        {
          label: t("companyWorkspace.overview.aiCommand.estimatedMonthEndUsage"),
          value:
            metrics.estimatedMonthEndUsage != null
              ? metrics.estimatedMonthEndUsage.toLocaleString()
              : null,
        },
        {
          label: t("companyWorkspace.overview.aiUsage.estimatedCost"),
          value:
            metrics.estimatedMonthEndCost != null
              ? formatBillingCurrency(
                  metrics.estimatedMonthEndCost,
                  metrics.currency,
                )
              : null,
        },
        {
          label: t("companyWorkspace.overview.aiCommand.estimatedFinishDate"),
          value: metrics.estimatedFinishDate
            ? formatBillingDate(metrics.estimatedFinishDate)
            : null,
        },
        {
          label: t("companyWorkspace.overview.aiCommand.remainingDays"),
          value:
            metrics.estimatedFinishDays != null
              ? t("companyWorkspace.overview.aiCommand.days", {
                  count: metrics.estimatedFinishDays,
                })
              : null,
        },
        {
          label: t("companyWorkspace.overview.aiUsage.remaining"),
          value:
            metrics.remaining != null ? metrics.remaining.toLocaleString() : null,
        },
        {
          label: t("companyWorkspace.overview.aiUsage.extraTokens"),
          value:
            metrics.overageTokens != null
              ? metrics.overageTokens.toLocaleString()
              : null,
        },
        {
          label: t("companyWorkspace.overview.aiUsage.estimatedCharge"),
          value:
            metrics.estimatedExtraCost != null
              ? formatBillingCurrency(metrics.estimatedExtraCost, metrics.currency)
              : null,
        },
      ].filter((item) => item.value != null)
    : [];

  const healthItems = metrics
    ? [
        {
          label: t("companyWorkspace.overview.aiUsage.successPct"),
          value: metrics.successPct != null ? `${metrics.successPct}%` : null,
        },
        {
          label: t("companyWorkspace.overview.aiUsage.responseTime"),
          value:
            metrics.averageLatencyMs != null
              ? t("companyWorkspace.overview.aiUsage.ms", {
                  value: metrics.averageLatencyMs,
                })
              : null,
        },
        {
          label: t("companyWorkspace.overview.aiCommand.retries"),
          value: metrics.retries != null ? metrics.retries.toLocaleString() : null,
        },
        {
          label: t("companyWorkspace.overview.aiCommand.failures"),
          value: metrics.failures != null ? metrics.failures.toLocaleString() : null,
        },
        {
          label: t("companyWorkspace.overview.aiUsage.errorPct"),
          value: metrics.errorPct != null ? `${metrics.errorPct}%` : null,
        },
      ].filter((item) => item.value != null)
    : [];

  const billingHasData =
    metrics != null &&
    (metrics.costThisMonth > 0 ||
      metrics.costToday != null ||
      metrics.estimatedMonthEndCost != null ||
      metrics.estimatedExtraCost != null);

  return (
    <OverviewSection
      title={t("companyWorkspace.overview.aiCommand.title")}
      subtitle={t("companyWorkspace.overview.aiCommand.subtitle")}
    >
      {isLoading ? (
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded-xl bg-muted/40" />
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="h-16 animate-pulse rounded-xl bg-muted/40" />
            <div className="h-16 animate-pulse rounded-xl bg-muted/40" />
            <div className="h-16 animate-pulse rounded-xl bg-muted/40" />
          </div>
          <div className="h-40 animate-pulse rounded-xl bg-muted/40" />
        </div>
      ) : !showConnected || !metrics ? (
        <div className="flex items-start gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-6">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <Sparkles className="size-4" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-medium">
              {t("companyWorkspace.overview.aiUsage.noUsageYet")}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("companyWorkspace.overview.aiUsage.noUsageYetHint")}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section 1 — Quota hero (hidden without real quota) */}
          <QuotaHero metrics={metrics} />

          {/* Section 9 — Warnings (surface early when present) */}
          {metrics.warningLevel ? (
            <div
              className={cn(
                "rounded-xl border px-4 py-3",
                metrics.warningLevel === "over" || metrics.warningLevel === "red"
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-warning/30 bg-warning/5",
              )}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    metrics.warningLevel === "yellow"
                      ? "text-warning"
                      : "text-destructive",
                  )}
                />
                <div className="min-w-0 space-y-1">
                  {metrics.warningLevel === "over" ? (
                    <>
                      <p className="text-sm font-semibold text-destructive">
                        {t("companyWorkspace.overview.aiCommand.warnings.quotaExceeded")}
                      </p>
                      {metrics.estimatedExtraCost != null ? (
                        <p className="text-xs text-muted-foreground">
                          {t("companyWorkspace.overview.aiCommand.warnings.extraCharge", {
                            amount: formatBillingCurrency(
                              metrics.estimatedExtraCost,
                              metrics.currency,
                            ),
                          })}
                        </p>
                      ) : null}
                    </>
                  ) : metrics.warningLevel === "red" ? (
                    <p className="text-sm font-semibold text-destructive">
                      {t("companyWorkspace.overview.aiCommand.warnings.remainingCritical", {
                        pct: Math.round(metrics.remainingPct ?? 0),
                      })}
                    </p>
                  ) : (
                    <p className="text-sm font-semibold text-warning">
                      {t("companyWorkspace.overview.aiCommand.warnings.remainingLow", {
                        pct: Math.round(metrics.remainingPct ?? 0),
                      })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {/* Section 2 — Consumption */}
          {consumptionItems.length > 0 ? (
            <SubSection title={t("companyWorkspace.overview.aiCommand.consumption")}>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {consumptionItems.map((item) => (
                  <Metric key={item.label} label={item.label} value={item.value} />
                ))}
              </div>
            </SubSection>
          ) : null}

          {/* Section 3 — Forecast */}
          {forecastItems.length > 0 ? (
            <SubSection title={t("companyWorkspace.overview.aiCommand.forecast")}>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {forecastItems.map((item) => (
                  <Metric key={item.label} label={item.label} value={item.value} />
                ))}
              </div>
            </SubSection>
          ) : null}

          {/* Section 4 — AI Health */}
          {healthItems.length > 0 ? (
            <SubSection title={t("companyWorkspace.overview.aiCommand.health")}>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {healthItems.map((item) => (
                  <Metric key={item.label} label={item.label} value={item.value} />
                ))}
              </div>
            </SubSection>
          ) : null}

          {/* Sections 5–6 — Top Models / Features */}
          {metrics.topModels.length > 0 || metrics.topFeatures.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <ModelRankList
                title={t("companyWorkspace.overview.aiCommand.topModels")}
                items={metrics.topModels}
                currency={metrics.currency}
              />
              <FeatureRankList
                title={t("companyWorkspace.overview.aiCommand.topFeatures")}
                items={metrics.topFeatures}
              />
            </div>
          ) : null}

          {/* Section 7 — Daily usage chart */}
          {metrics.dailySeries.length > 0 ? (
            <SubSection title={t("companyWorkspace.overview.aiUsage.dailyUsage")}>
              <DailyUsageBars
                series={metrics.dailySeries}
                emptyLabel={t("companyWorkspace.overview.aiUsage.noDailySeries")}
                tokensLabel={t("companyWorkspace.overview.aiUsage.tokens")}
              />
            </SubSection>
          ) : null}

          {/* Section 8 — Billing summary */}
          {billingHasData ? (
            <SubSection title={t("companyWorkspace.overview.aiCommand.billingSummary")}>
              <div className="rounded-xl border border-border/50 bg-muted/10 px-4 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <StatusPill tone="info">{metrics.currency}</StatusPill>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <InfoField
                    label={t("companyWorkspace.overview.aiCommand.monthlyCost")}
                    value={
                      metrics.costThisMonth > 0
                        ? formatBillingCurrency(metrics.costThisMonth, metrics.currency)
                        : null
                    }
                  />
                  <InfoField
                    label={t("companyWorkspace.overview.aiCommand.todayCost")}
                    value={
                      metrics.costToday != null
                        ? formatBillingCurrency(metrics.costToday, metrics.currency)
                        : null
                    }
                  />
                  <InfoField
                    label={t("companyWorkspace.overview.aiCommand.projectedCost")}
                    value={
                      metrics.estimatedMonthEndCost != null
                        ? formatBillingCurrency(
                            metrics.estimatedMonthEndCost,
                            metrics.currency,
                          )
                        : null
                    }
                  />
                  <InfoField
                    label={t("companyWorkspace.overview.aiCommand.overageCost")}
                    value={
                      metrics.estimatedExtraCost != null
                        ? formatBillingCurrency(
                            metrics.estimatedExtraCost,
                            metrics.currency,
                          )
                        : null
                    }
                  />
                </div>
              </div>
            </SubSection>
          ) : null}
        </div>
      )}
    </OverviewSection>
  );
}
