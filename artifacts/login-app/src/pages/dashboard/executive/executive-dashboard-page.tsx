import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Coins,
  Download,
  Minus,
  Send,
  Stethoscope,
  TrendingUp,
  Users,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useHasPermission } from "@/hooks/use-rbac";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BranchSelector } from "@/lib/company/branches/components";
import { useBranches } from "@/lib/company/branches/hooks";
import { formatMoney } from "@/lib/billing/utilities/money";
import type { ExecutiveReport } from "@/lib/executive/types";
import {
  EXECUTIVE_QUICK_ACTIONS,
  exportExecutiveReportCsv,
  useExecutiveDashboard,
  useDismissExecutiveAlert,
} from "@/lib/executive";
import type { TrendDirection } from "@/lib/executive/types/executive-enums";

type ExecutiveDashboardPageProps = Record<string, never>;

function TrendIndicator({ trend }: { trend: TrendDirection }) {
  if (trend === "up") return <ArrowUpRight className="h-4 w-4 text-emerald-400" aria-label="trend up" />;
  if (trend === "down") return <ArrowDownRight className="h-4 w-4 text-rose-400" aria-label="trend down" />;
  return <Minus className="h-4 w-4 text-muted-foreground" aria-label="trend flat" />;
}

function severityVariant(severity: string): "default" | "secondary" | "destructive" | "outline" {
  if (severity === "critical") return "destructive";
  if (severity === "warning") return "secondary";
  return "outline";
}

export function ExecutiveDashboardPage(_props: ExecutiveDashboardPageProps) {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { profile, user } = useAuth();
  const canView = useHasPermission("executive.view") || useHasPermission("reports.view");
  const companyId = profile?.company_id ?? null;
  const [branchId, setBranchId] = useState<string | null>(null);
  const { data: branches = [] } = useBranches(companyId);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const context = companyId
    ? { companyId, branchId, timezone: "UTC", date: today }
    : null;

  const { data: dashboard, isLoading } = useExecutiveDashboard(context);
  const dismissAlert = useDismissExecutiveAlert(companyId);

  const handleExport = () => {
    if (!dashboard || !companyId) return;
    const report: ExecutiveReport = {
      title: "Executive Daily Report",
      kind: "daily",
      period: "daily",
      generatedAt: new Date().toISOString(),
      sections: [
        { heading: "Summary", metrics: { Revenue: formatMoney(dashboard.summary.todayRevenueCents), Bookings: dashboard.summary.bookingsToday } },
        { heading: "Operational", metrics: { "Completion %": dashboard.operational.completionRate, "No-Show %": dashboard.operational.noShowRate } },
      ],
    };
    exportExecutiveReportCsv(report);
  };

  if (!canView) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        {t("executive.noPermission")}
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        {t("executive.noCompany")}
      </div>
    );
  }

  const s = dashboard?.summary;
  const op = dashboard?.operational;
  const fin = dashboard?.financial;
  const cust = dashboard?.customer;
  const comm = dashboard?.communication;

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("executive.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("executive.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BranchSelector branches={branches} value={branchId} onChange={setBranchId} allowAll />
          <Button variant="outline" onClick={handleExport} disabled={isLoading || !dashboard}>
            <Download className="mr-2 h-4 w-4" aria-hidden />
            {t("executive.export")}
          </Button>
        </div>
      </header>

      {/* Executive Summary */}
      <section aria-label={t("executive.summaryTitle")}>
        <h2 className="mb-3 text-lg font-semibold">{t("executive.summaryTitle")}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("executive.todayRevenue")}</CardTitle>
              {s ? <TrendIndicator trend={s.trends.revenue} /> : null}
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{formatMoney(s?.todayRevenueCents ?? 0)}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t("executive.monthlyRevenue")}</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{formatMoney(s?.monthlyRevenueCents ?? 0)}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{t("executive.bookingsToday")}</CardTitle>
              {s ? <TrendIndicator trend={s.trends.bookings} /> : null}
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{s?.bookingsToday ?? 0}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t("executive.outstanding")}</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{formatMoney(s?.outstandingBalanceCents ?? 0)}</div></CardContent>
          </Card>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card><CardContent className="pt-4 text-sm"><span className="text-muted-foreground">{t("executive.completed")}</span><div className="text-xl font-semibold">{s?.completedToday ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-4 text-sm"><span className="text-muted-foreground">{t("executive.cancelled")}</span><div className="text-xl font-semibold">{s?.cancelledToday ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-4 text-sm"><span className="text-muted-foreground">{t("executive.noShows")}</span><div className="text-xl font-semibold">{s?.noShowsToday ?? 0}</div></CardContent></Card>
          <Card><CardContent className="pt-4 text-sm"><span className="text-muted-foreground">{t("executive.cashCollected")}</span><div className="text-xl font-semibold">{formatMoney(s?.cashCollectedCents ?? 0)}</div></CardContent></Card>
        </div>
      </section>

      {/* KPI Sections */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" />{t("executive.operationalTitle")}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">{t("executive.completionRate")}</span><div className="font-semibold">{op?.completionRate ?? 0}%</div></div>
            <div><span className="text-muted-foreground">{t("executive.cancellationRate")}</span><div className="font-semibold">{op?.cancellationRate ?? 0}%</div></div>
            <div><span className="text-muted-foreground">{t("executive.noShowRate")}</span><div className="font-semibold">{op?.noShowRate ?? 0}%</div></div>
            <div><span className="text-muted-foreground">{t("executive.capacity")}</span><div className="font-semibold">{op?.capacityUtilization ?? 0}%</div></div>
            <div><span className="text-muted-foreground">{t("executive.peakHour")}</span><div className="font-semibold">{op?.peakHour ?? "—"}</div></div>
            <div><span className="text-muted-foreground">{t("executive.avgWait")}</span><div className="font-semibold">{op?.averageWaitingMinutes ?? 0}m</div></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Coins className="h-4 w-4" />{t("executive.financialTitle")}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">{t("executive.revenue")}</span><div className="font-semibold">{formatMoney(fin?.revenueCents ?? 0)}</div></div>
            <div><span className="text-muted-foreground">{t("executive.refundRate")}</span><div className="font-semibold">{fin?.refundRate ?? 0}%</div></div>
            <div><span className="text-muted-foreground">{t("executive.perDoctor")}</span><div className="font-semibold">{formatMoney(fin?.revenuePerDoctorCents ?? 0)}</div></div>
            <div><span className="text-muted-foreground">{t("executive.perBranch")}</span><div className="font-semibold">{formatMoney(fin?.revenuePerBranchCents ?? 0)}</div></div>
            <div><span className="text-muted-foreground">{t("executive.taxSummary")}</span><div className="font-semibold">{formatMoney(fin?.taxCollectedCents ?? 0)}</div></div>
            <div><span className="text-muted-foreground">{t("executive.collections")}</span><div className="font-semibold">{formatMoney(fin?.collectionsCents ?? 0)}</div></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" />{t("executive.customerTitle")}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">{t("executive.newCustomers")}</span><div className="font-semibold">{cust?.newCustomers ?? 0}</div></div>
            <div><span className="text-muted-foreground">{t("executive.retention")}</span><div className="font-semibold">{cust?.retentionRate ?? 0}%</div></div>
            <div><span className="text-muted-foreground">{t("executive.repeatBooking")}</span><div className="font-semibold">{cust?.repeatBookingPercent ?? 0}%</div></div>
            <div><span className="text-muted-foreground">{t("executive.portalUsage")}</span><div className="font-semibold">{cust?.portalUsageCount ?? 0}</div></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Send className="h-4 w-4" />{t("executive.communicationTitle")}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">{t("executive.delivered")}</span><div className="font-semibold">{(comm?.whatsappDelivered ?? 0) + (comm?.emailDelivered ?? 0)}</div></div>
            <div><span className="text-muted-foreground">{t("executive.failed")}</span><div className="font-semibold">{comm?.failedMessages ?? 0}</div></div>
            <div><span className="text-muted-foreground">{t("executive.deliverySuccess")}</span><div className="font-semibold">{comm?.deliverySuccessRate ?? 0}%</div></div>
            <div><span className="text-muted-foreground">{t("executive.reminderSuccess")}</span><div className="font-semibold">{comm?.reminderSuccessRate ?? 0}%</div></div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{t("executive.alertsTitle")}</CardTitle></CardHeader>
        <CardContent>
          {(dashboard?.alerts ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("executive.noAlerts")}</p>
          ) : (
            <ul className="space-y-2">
              {(dashboard?.alerts ?? []).map((alert) => (
                <li key={alert.id} className="flex items-center justify-between rounded-lg border border-white/10 p-3 text-sm">
                  <div>
                    <div className="font-medium">{alert.title}</div>
                    <div className="text-muted-foreground">{alert.message}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={severityVariant(alert.severity)}>{alert.severity}</Badge>
                    {user?.id ? (
                      <Button size="sm" variant="ghost" onClick={() => dismissAlert.mutate({ alertId: alert.id, actorId: user.id })}>
                        {t("executive.dismiss")}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Branch & Doctor Intelligence */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" />{t("executive.branchTitle")}</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {(dashboard?.branches ?? []).slice(0, 5).map((b) => (
                <li key={b.branchId} className="flex justify-between rounded-lg border border-white/10 p-2">
                  <span>#{b.ranking} {b.branchName}</span>
                  <span>{formatMoney(b.revenueCents)} · {b.healthScore}%</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Stethoscope className="h-4 w-4" />{t("executive.doctorTitle")}</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {(dashboard?.doctors ?? []).slice(0, 5).map((d) => (
                <li key={d.resourceId} className="flex justify-between rounded-lg border border-white/10 p-2">
                  <span>#{d.ranking} {d.resourceName}</span>
                  <span>{formatMoney(d.revenueCents)} · {d.utilization}%</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Forecasts */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" />{t("executive.forecastTitle")}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {(dashboard?.forecasts ?? []).filter((f) => f.horizonDays === 7 && f.forecastType === "revenue").slice(0, 1).map((f) => (
              <div key={`${f.forecastType}-${f.horizonDays}`} className="rounded-lg border border-white/10 p-3 text-sm">
                <div className="font-medium">{t("executive.revenueForecast7d")}</div>
                <div className="text-2xl font-bold">{formatMoney(f.points.at(-1)?.value ?? 0)}</div>
                <div className="text-muted-foreground">{f.growthTrendPercent > 0 ? "+" : ""}{f.growthTrendPercent}% {t("executive.trend")}</div>
              </div>
            ))}
            {(dashboard?.forecasts ?? []).filter((f) => f.horizonDays === 7 && f.forecastType === "bookings").slice(0, 1).map((f) => (
              <div key={`${f.forecastType}-${f.horizonDays}`} className="rounded-lg border border-white/10 p-3 text-sm">
                <div className="font-medium">{t("executive.bookingsForecast7d")}</div>
                <div className="text-2xl font-bold">{f.points.at(-1)?.value ?? 0}</div>
              </div>
            ))}
            {(dashboard?.forecasts ?? []).filter((f) => f.horizonDays === 30 && f.forecastType === "cash_flow").slice(0, 1).map((f) => (
              <div key={`${f.forecastType}-${f.horizonDays}`} className="rounded-lg border border-white/10 p-3 text-sm">
                <div className="font-medium">{t("executive.cashFlowForecast30d")}</div>
                <div className="text-2xl font-bold">{formatMoney(f.points.at(-1)?.value ?? 0)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("executive.quickActions")}</h2>
        <div className="flex flex-wrap gap-2">
          {EXECUTIVE_QUICK_ACTIONS.map((action) => (
            <Button key={action.id} variant="outline" onClick={() => setLocation(action.path)}>
              {t(action.labelKey)}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}
