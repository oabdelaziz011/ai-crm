import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Building2, LineChart, Sparkles, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/ui";
import { useAuth } from "@/context/auth-context";
import {
  useDismissExecutiveAlert,
  useExecutiveDashboard,
  useResolveExecutiveAlert,
} from "@/lib/executive/hooks/use-executive-dashboard";
import type { ExecutiveAlert, ForecastResult } from "@/lib/executive/types";
import { formatMoney } from "@/lib/billing/utilities/money";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function severityClass(severity: ExecutiveAlert["severity"]): string {
  switch (severity) {
    case "critical":
      return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300";
    case "warning":
      return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200";
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

function forecastLabel(
  t: (key: string) => string,
  forecast: ForecastResult,
): string {
  const typeKey = `executiveDashboard.intelligence.forecastTypes.${forecast.forecastType}`;
  const translated = t(typeKey);
  return translated === typeKey ? forecast.forecastType : translated;
}

/** Wired panels from lib/executive (alerts, forecasts, branch intelligence, timeline). */
export function ExecutiveIntelligencePanels() {
  const { t, i18n } = useTranslation("common");
  const { profile, user } = useAuth();
  const companyId = profile?.company_id ?? null;
  const locale = i18n.language?.startsWith("ar") ? "ar" : "en";

  const context = useMemo(
    () =>
      companyId
        ? {
            companyId,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            date: todayIsoDate(),
          }
        : null,
    [companyId],
  );

  const { data: snapshot, isLoading, isError } = useExecutiveDashboard(context);
  const dismiss = useDismissExecutiveAlert(companyId);
  const resolve = useResolveExecutiveAlert(companyId);

  if (!companyId) return null;

  if (isLoading && !snapshot) {
    return (
      <DashboardCard className="p-5 text-sm text-muted-foreground">
        {t("executiveDashboard.intelligence.loading")}
      </DashboardCard>
    );
  }

  if (isError || !snapshot) {
    return (
      <DashboardCard className="p-5 text-sm text-muted-foreground">
        {t("executiveDashboard.intelligence.unavailable")}
      </DashboardCard>
    );
  }

  const alerts = snapshot.alerts.slice(0, 6);
  const forecasts = snapshot.forecasts.slice(0, 3);
  const branches = snapshot.branches.slice(0, 5);
  const timeline = snapshot.timeline.slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
          {t("executiveDashboard.intelligence.sectionTitle")}
        </h2>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardCard className="p-0 overflow-hidden">
          <div className="border-b border-border/60 px-5 py-4">
            <h3 className="font-semibold flex items-center gap-2">
              <AlertTriangle className="size-4" aria-hidden />
              {t("executiveDashboard.intelligence.alertsTitle")}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("executiveDashboard.intelligence.alertsSubtitle")}
            </p>
          </div>
          <div className="space-y-3 p-5">
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("executiveDashboard.intelligence.alertsEmpty")}
              </p>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-lg border border-border/60 p-3 space-y-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={severityClass(alert.severity)}>
                      {t(`executiveDashboard.intelligence.severity.${alert.severity}`, {
                        defaultValue: alert.severity,
                      })}
                    </Badge>
                    <span className="text-sm font-medium">{alert.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{alert.message}</p>
                  {user?.id && alert.status === "active" && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={dismiss.isPending}
                        onClick={() =>
                          dismiss.mutate({ alertId: alert.id, actorId: user.id })
                        }
                      >
                        {t("executiveDashboard.intelligence.dismiss")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={resolve.isPending}
                        onClick={() =>
                          resolve.mutate({ alertId: alert.id, actorId: user.id })
                        }
                      >
                        {t("executiveDashboard.intelligence.resolve")}
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </DashboardCard>

        <DashboardCard className="p-0 overflow-hidden">
          <div className="border-b border-border/60 px-5 py-4">
            <h3 className="font-semibold flex items-center gap-2">
              <TrendingUp className="size-4" aria-hidden />
              {t("executiveDashboard.intelligence.forecastsTitle")}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("executiveDashboard.intelligence.forecastsSubtitle")}
            </p>
          </div>
          <div className="space-y-3 p-5">
            {forecasts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("executiveDashboard.intelligence.forecastsEmpty")}
              </p>
            ) : (
              forecasts.map((forecast) => (
                <div
                  key={`${forecast.forecastType}-${forecast.horizonDays}`}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{forecastLabel(t, forecast)}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("executiveDashboard.intelligence.horizonDays", {
                        days: forecast.horizonDays,
                      })}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="text-sm font-semibold tabular-nums">
                      {forecast.growthTrendPercent >= 0 ? "+" : ""}
                      {forecast.growthTrendPercent.toFixed(1)}%
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {t("executiveDashboard.intelligence.growthTrend")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </DashboardCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardCard className="p-0 overflow-hidden">
          <div className="border-b border-border/60 px-5 py-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Building2 className="size-4" aria-hidden />
              {t("executiveDashboard.intelligence.branchesTitle")}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("executiveDashboard.intelligence.branchesSubtitle")}
            </p>
          </div>
          <div className="overflow-x-auto">
            {branches.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">
                {t("executiveDashboard.intelligence.branchesEmpty")}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-start text-xs text-muted-foreground">
                    <th className="px-5 py-3 font-medium">
                      {t("executiveDashboard.intelligence.colBranch")}
                    </th>
                    <th className="px-5 py-3 font-medium">
                      {t("executiveDashboard.intelligence.colRevenue")}
                    </th>
                    <th className="px-5 py-3 font-medium">
                      {t("executiveDashboard.intelligence.colBookings")}
                    </th>
                    <th className="px-5 py-3 font-medium">
                      {t("executiveDashboard.intelligence.colHealth")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((row) => (
                    <tr key={row.branchId} className="border-b border-border/40">
                      <td className="px-5 py-3 font-medium">
                        #{row.ranking} {row.branchName}
                      </td>
                      <td className="px-5 py-3 tabular-nums">
                        {formatMoney(row.revenueCents)}
                      </td>
                      <td className="px-5 py-3 tabular-nums">{row.bookings}</td>
                      <td className="px-5 py-3 tabular-nums">{row.healthScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DashboardCard>

        <DashboardCard className="p-0 overflow-hidden">
          <div className="border-b border-border/60 px-5 py-4">
            <h3 className="font-semibold flex items-center gap-2">
              <LineChart className="size-4" aria-hidden />
              {t("executiveDashboard.intelligence.timelineTitle")}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("executiveDashboard.intelligence.timelineSubtitle")}
            </p>
          </div>
          <div className="space-y-3 p-5">
            {timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("executiveDashboard.intelligence.timelineEmpty")}
              </p>
            ) : (
              timeline.map((event) => (
                <div key={event.id} className="border-s-2 border-primary/30 ps-3">
                  <p className="text-sm font-medium">{event.title}</p>
                  {event.description ? (
                    <p className="text-xs text-muted-foreground">{event.description}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(event.occurredAt))}
                  </p>
                </div>
              ))
            )}
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
