import { useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Activity, Clock, Layers, MessageSquare, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardCard, DashboardStatCard } from "@/components/dashboard/ui";
import { useFloatingAi } from "@/context/floating-ai-context";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  useAiAnalyticsAggregate,
  useAiAnalyticsRecords,
} from "@/hooks/ai-observability/use-ai-analytics";
import { useAiCostAggregate } from "@/hooks/ai-observability/use-ai-costs";
import { requestOpenFloatingAi } from "@/lib/floating-ai/open-assistant";
import { dashboardNestHref } from "@/lib/routing";
import type { ExecutiveKpiCardModel } from "@/lib/dashboard";

type ExecutiveAiBridgePanelProps = {
  timeRange: string;
  kpis: ExecutiveKpiCardModel[];
  resolveKpiTitle: (item: ExecutiveKpiCardModel) => string;
};

/** Connects Executive Intelligence to live AI analytics + floating assistant context. */
export function ExecutiveAiBridgePanel({
  timeRange,
  kpis,
  resolveKpiTitle,
}: ExecutiveAiBridgePanelProps) {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const { registerPageContext } = useFloatingAi();

  const canViewAnalytics = isSuperAdmin || hasPermission("ai.analytics.view");
  const canViewCosts = isSuperAdmin || hasPermission("ai.costs.view");
  const canOpenChat = isSuperAdmin || hasPermission("ai_chat.view");

  const { data: analytics, isLoading: analyticsLoading } = useAiAnalyticsAggregate(
    200,
    canViewAnalytics,
  );
  const { data: recent = [] } = useAiAnalyticsRecords(5, canViewAnalytics);
  const { data: costs, isLoading: costsLoading } = useAiCostAggregate(undefined, canViewCosts);

  const prompts = useMemo(
    () =>
      [
        { id: "brief", labelKey: "executiveDashboard.ai.promptBriefShort", text: t("executiveDashboard.ai.promptBrief") },
        { id: "risks", labelKey: "executiveDashboard.ai.promptRisksShort", text: t("executiveDashboard.ai.promptRisks") },
        { id: "actions", labelKey: "executiveDashboard.ai.promptNextActionsShort", text: t("executiveDashboard.ai.promptNextActions") },
      ] as const,
    [t],
  );

  const kpiBrief = useMemo(
    () =>
      kpis
        .filter((item) => item.state === "ready")
        .slice(0, 8)
        .map((item) => `${resolveKpiTitle(item)}: ${item.value}`)
        .join(" · "),
    [kpis, resolveKpiTitle],
  );

  useEffect(() => {
    registerPageContext({
      moduleLabel: t("navigation.executive"),
      pageTitle: t("executiveDashboard.title"),
      filters: {
        timeRange,
        source: "executive_intelligence",
      },
      executiveBriefing: {
        timeRange,
        kpiSummary: kpiBrief,
        aiExecutions: analytics?.totalExecutions ?? null,
        aiTokens: analytics?.totalTokens ?? null,
        aiAverageLatencyMs: analytics?.averageLatencyMs ?? null,
        aiEstimatedCost: costs?.totalCost ?? null,
        aiCurrency: costs?.currency ?? null,
      },
      suggestedPrompts: prompts.map((prompt) => prompt.text),
    });
  }, [
    analytics?.averageLatencyMs,
    analytics?.totalExecutions,
    analytics?.totalTokens,
    costs?.currency,
    costs?.totalCost,
    kpiBrief,
    prompts,
    registerPageContext,
    t,
    timeRange,
  ]);

  const openAssistant = (draft?: string) => {
    requestOpenFloatingAi(draft ? { draft } : undefined);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("executiveDashboard.ai.sectionTitle")}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {canOpenChat && (
            <Button
              type="button"
              size="sm"
              onClick={() => openAssistant(t("executiveDashboard.ai.promptBrief"))}
            >
              <MessageSquare className="me-1 size-3.5" />
              {t("executiveDashboard.ai.askAssistant")}
            </Button>
          )}
          <Button asChild type="button" size="sm" variant="outline">
            <Link href={dashboardNestHref("/ai-chat")}>{t("executiveDashboard.ai.openAiChat")}</Link>
          </Button>
          {canViewAnalytics && (
            <Button asChild type="button" size="sm" variant="outline">
              <Link href={dashboardNestHref("/ai-analytics")}>
                {t("executiveDashboard.ai.openAnalytics")}
              </Link>
            </Button>
          )}
          {canViewCosts && (
            <Button asChild type="button" size="sm" variant="outline">
              <Link href={dashboardNestHref("/ai-usage")}>{t("executiveDashboard.ai.openUsage")}</Link>
            </Button>
          )}
        </div>
      </div>

      <DashboardCard className="border-primary/15 bg-primary/[0.03] p-4">
        <p className="text-sm font-medium">{t("executiveDashboard.ai.bridgeTitle")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("executiveDashboard.ai.bridgeBody")}</p>
        {kpiBrief ? (
          <p className="mt-3 rounded-md border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{t("executiveDashboard.ai.contextLabel")}: </span>
            {kpiBrief}
          </p>
        ) : null}
        {canOpenChat && (
          <div className="mt-3 flex flex-wrap gap-2">
            {prompts.map((prompt) => (
              <Button
                key={prompt.id}
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => openAssistant(prompt.text)}
              >
                {t(prompt.labelKey)}
              </Button>
            ))}
          </div>
        )}
      </DashboardCard>

      {(canViewAnalytics || canViewCosts) && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {canViewAnalytics && (
            <>
              <button
                type="button"
                className="rounded-xl text-start transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setLocation(dashboardNestHref("/ai-analytics"))}
              >
                <DashboardStatCard
                  label={t("executiveDashboard.ai.stats.executions")}
                  value={analytics?.totalExecutions ?? "—"}
                  icon={Activity}
                  loading={analyticsLoading}
                />
              </button>
              <button
                type="button"
                className="rounded-xl text-start transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setLocation(dashboardNestHref("/ai-analytics"))}
              >
                <DashboardStatCard
                  label={t("executiveDashboard.ai.stats.latency")}
                  value={analytics ? `${analytics.averageLatencyMs} ms` : "—"}
                  icon={Clock}
                  loading={analyticsLoading}
                />
              </button>
              <button
                type="button"
                className="rounded-xl text-start transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setLocation(dashboardNestHref("/ai-analytics"))}
              >
                <DashboardStatCard
                  label={t("executiveDashboard.ai.stats.tokens")}
                  value={analytics?.totalTokens?.toLocaleString() ?? "—"}
                  icon={Layers}
                  loading={analyticsLoading}
                />
              </button>
            </>
          )}
          {canViewCosts && (
            <button
              type="button"
              className="rounded-xl text-start transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setLocation(dashboardNestHref("/ai-usage"))}
            >
              <DashboardStatCard
                label={t("executiveDashboard.ai.stats.cost")}
                value={
                  costs
                    ? `${costs.currency ?? ""} ${Number(costs.totalCost ?? 0).toFixed(4)}`
                    : "—"
                }
                icon={Zap}
                loading={costsLoading}
              />
            </button>
          )}
        </div>
      )}

      {canViewAnalytics && recent.length > 0 && (
        <DashboardCard className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3">
            <h3 className="text-sm font-semibold">{t("executiveDashboard.ai.recentTitle")}</h3>
            <Button asChild type="button" size="sm" variant="ghost">
              <Link href={dashboardNestHref("/ai-analytics")}>
                {t("executiveDashboard.ai.viewAllExecutions")}
              </Link>
            </Button>
          </div>
          <ul className="divide-y divide-border/50">
            {recent.map((record) => (
              <li key={record.id}>
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-5 py-3 text-start text-sm transition-colors hover:bg-muted/30"
                  onClick={() => setLocation(dashboardNestHref("/ai-analytics"))}
                >
                  <span className="font-medium capitalize">{record.provider_key}</span>
                  <span className="text-xs text-muted-foreground">
                    {t(`executiveDashboard.ai.executionStatus.${record.execution_status}`, {
                      defaultValue: record.execution_status,
                    })}
                    {" · "}
                    {record.latency_ms} ms · {record.total_tokens}{" "}
                    {t("executiveDashboard.ai.tokensUnit")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </DashboardCard>
      )}

      {!canViewAnalytics && !canViewCosts && (
        <DashboardCard className="p-4 text-sm text-muted-foreground">
          {t("executiveDashboard.ai.noAiPermission")}
        </DashboardCard>
      )}
    </div>
  );
}
