import { useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Eye,
  Filter,
  MoreHorizontal,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { CompanyIdentityCompact } from "@/components/billing/identity/company-identity-compact";
import { SubscriptionStatusBadge } from "@/components/billing/status/subscription-status-badge";
import { BillingEmptyState } from "@/components/billing/ui/billing-empty-state";
import { BillingKpiGrid } from "@/components/billing/ui/billing-kpi-grid";
import { BillingPagination } from "@/components/billing/ui/billing-pagination";
import { BillingToolbar } from "@/components/billing/ui/billing-toolbar";
import { DashboardCard, DashboardErrorBanner, DashboardTableSkeleton } from "@/components/dashboard/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBillingHealthContext } from "@/context/billing-health-context";
import {
  useCompanySubscriptionsPaged,
  type SortDirection,
  type SubscriptionSortKey,
} from "@/hooks/billing/use-company-subscriptions";
import {
  clampLifecycleEnforcementLimit,
  LIFECYCLE_ENFORCEMENT_DEFAULT_LIMIT,
  LIFECYCLE_ENFORCEMENT_MAX_LIMIT,
  useRunSubscriptionLifecycleEnforcement,
} from "@/hooks/billing/use-billing-lifecycle";
import { useBillingRevenueMetrics } from "@/hooks/billing/use-platform-financial-list";
import { useToast } from "@/hooks/use-toast";
import { useAuthUser } from "@/hooks/use-rbac";
import { canEditBilling, canViewBilling } from "@/lib/billing/billing-permissions";
import { billingNotAvailable, translateBillingCycle } from "@/lib/billing/billing-display-i18n";
import { downloadCsv } from "@/lib/billing/export-csv";
import { fetchCompanySubscriptionsForExport } from "@/lib/billing/fetch-export-data";
import { formatBillingCurrency, formatBillingDate } from "@/lib/billing/format";
import { summarizeLifecycleEnforcementResult } from "@/lib/billing/lifecycle-enforcement-summary";
import { billingDetailHref } from "@/lib/routing";
import type { BillingSubscriptionStatus, CompanySubscription } from "@/lib/billing/types";

const PAGE_SIZE = 10;

export function BillingOverviewPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const { mutationsAllowed } = useBillingHealthContext();
  const canView = canViewBilling(hasPermission, isSuperAdmin);
  const canEdit = canEditBilling(hasPermission, isSuperAdmin) && mutationsAllowed;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | BillingSubscriptionStatus>("all");
  const [cycleFilter, setCycleFilter] = useState<"all" | "monthly" | "yearly">("all");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SubscriptionSortKey>("renewal");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [exporting, setExporting] = useState(false);
  const [enforcementConfirmOpen, setEnforcementConfirmOpen] = useState(false);
  const [enforcementLimitInput, setEnforcementLimitInput] = useState(
    String(LIFECYCLE_ENFORCEMENT_DEFAULT_LIMIT),
  );
  const [enforcementResult, setEnforcementResult] = useState<Record<string, unknown> | null>(null);
  const [enforcementError, setEnforcementError] = useState<string | null>(null);

  const runLifecycleEnforcement = useRunSubscriptionLifecycleEnforcement();

  const offset = (page - 1) * PAGE_SIZE;
  const { data, isLoading, error, isFetching } = useCompanySubscriptionsPaged({
    enabled: canView,
    limit: PAGE_SIZE,
    offset,
    search,
    status: statusFilter,
    billingCycle: cycleFilter,
    sortBy: sortKey,
    sortDir,
  });
  const { data: revenue, isLoading: revenueLoading } = useBillingRevenueMetrics(canView);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const stats = data?.stats ?? { total: 0, active: 0, trialing: 0, at_risk: 0 };
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleSort = (key: SubscriptionSortKey) => {
    if (sortKey === key) {
      setSortDir((value) => (value === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "company" || key === "plan" ? "asc" : "desc");
    }
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportRows = await fetchCompanySubscriptionsForExport({
        search,
        status: statusFilter,
        billingCycle: cycleFilter,
        sortBy: sortKey,
        sortDir,
      });
      downloadCsv(
        "billing-subscriptions.csv",
        [
          t("billing.tables.company"),
          t("billing.tables.plan"),
          t("billing.tables.cycle"),
          t("billing.tables.status"),
          t("billing.tables.renewal"),
        ],
        exportRows.map((row) => [
          row.company?.name ?? "",
          row.plan?.display_name ?? row.plan?.name ?? "",
          row.billing_cycle,
          row.status,
          row.next_renewal_at ?? row.current_period_end ?? "",
        ]),
      );
    } finally {
      setExporting(false);
    }
  };

  const activeRate = stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0;

  const clampedEnforcementLimit = clampLifecycleEnforcementLimit(
    Number(enforcementLimitInput) || LIFECYCLE_ENFORCEMENT_DEFAULT_LIMIT,
  );
  const enforcementSummary = summarizeLifecycleEnforcementResult(enforcementResult);

  const handleRunLifecycleEnforcement = async () => {
    setEnforcementError(null);
    try {
      const result = await runLifecycleEnforcement.mutateAsync({
        limit: clampedEnforcementLimit,
      });
      setEnforcementResult(result);
      setEnforcementConfirmOpen(false);
      toast({
        title: t("billing.toast.successTitle"),
        description: t(
          "billing.edit.lifecycleEnforcementSuccess",
          "Lifecycle enforcement finished. Review the summary below.",
        ),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("billing.edit.lifecycleEnforcementFailed", "Lifecycle enforcement failed.");
      setEnforcementError(message);
      toast({
        title: t("billing.toast.errorTitle"),
        description: message,
        variant: "destructive",
      });
    }
  };

  if (!canView) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t("billing.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("billing.noPermission")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("billing.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("billing.subtitle")}</p>
      </div>

      <BillingKpiGrid
        loading={isLoading}
        items={[
          { key: "total", label: t("billing.stats.total"), value: stats.total, icon: CreditCard },
          { key: "active", label: t("billing.stats.active"), value: stats.active, icon: CheckCircle2, trend: `${activeRate}%`, trendUp: true },
          { key: "trialing", label: t("billing.stats.trialing"), value: stats.trialing, icon: Sparkles },
          { key: "atRisk", label: t("billing.stats.atRisk"), value: stats.at_risk, icon: AlertTriangle, trendUp: false },
        ]}
      />

      <BillingKpiGrid
        loading={revenueLoading}
        items={[
          { key: "mrr", label: t("billing.platform.analytics.mrr"), value: formatBillingCurrency(revenue?.mrr ?? 0), icon: DollarSign },
          { key: "arr", label: t("billing.platform.analytics.arr"), value: formatBillingCurrency(revenue?.arr ?? 0), icon: TrendingUp },
          { key: "failed30", label: t("billing.platform.analytics.failed30d"), value: revenue?.failed_payments_30d ?? 0, icon: AlertTriangle },
          { key: "failedRate", label: t("billing.platform.analytics.failedRate"), value: `${revenue?.failed_payment_rate ?? 0}%`, icon: AlertTriangle },
        ]}
      />

      {canEdit ? (
        <DashboardCard className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                {t("billing.edit.lifecycleEnforcementTitle", "Lifecycle enforcement")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(
                  "billing.edit.lifecycleEnforcementHint",
                  "Evaluates overdue trials, billing periods, and grace windows using existing lifecycle rules. Does not collect payment or perform paid renewal.",
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="text-xs text-muted-foreground" htmlFor="lifecycle-enforcement-limit">
                  {t("billing.edit.lifecycleEnforcementLimit", "Batch limit (max {{max}})", {
                    max: LIFECYCLE_ENFORCEMENT_MAX_LIMIT,
                  })}
                </label>
                <input
                  id="lifecycle-enforcement-limit"
                  type="number"
                  min={1}
                  max={LIFECYCLE_ENFORCEMENT_MAX_LIMIT}
                  value={enforcementLimitInput}
                  onChange={(e) => setEnforcementLimitInput(e.target.value)}
                  className="mt-1 block w-28 rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
                />
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setEnforcementLimitInput(String(clampedEnforcementLimit));
                  setEnforcementConfirmOpen(true);
                }}
                disabled={runLifecycleEnforcement.isPending}
              >
                {runLifecycleEnforcement.isPending
                  ? t("billing.common.loading")
                  : t("billing.edit.runLifecycleEnforcement", "Run Lifecycle Enforcement")}
              </Button>
            </div>
          </div>
          {enforcementError ? <DashboardErrorBanner message={enforcementError} /> : null}
          {enforcementSummary.length > 0 ? (
            <div className="rounded-xl border border-white/10 bg-background/40 p-4">
              <h3 className="text-sm font-medium">
                {t("billing.edit.lifecycleEnforcementResult", "Last enforcement result")}
              </h3>
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                {enforcementSummary.map((row) => (
                  <div key={row.key} className="flex justify-between gap-3 text-sm">
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd className="font-medium tabular-nums">{row.value}</dd>
                  </div>
                ))}
              </dl>
              {enforcementResult ? (
                <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-background/60 p-3 text-xs text-muted-foreground">
                  {JSON.stringify(enforcementResult, null, 2)}
                </pre>
              ) : null}
            </div>
          ) : null}
        </DashboardCard>
      ) : null}

      {error ? <DashboardErrorBanner message={error.message} /> : null}
      {data?.degraded && data.degradedMessage ? (
        <DashboardErrorBanner message={data.degradedMessage} />
      ) : null}

      <DashboardCard className="overflow-hidden">
        <BillingToolbar
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          searchPlaceholder={t("billing.searchPlaceholder")}
          onExport={handleExport}
          exportLabel={exporting ? t("billing.actions.exporting") : t("billing.actions.export")}
          exportDisabled={exporting || total === 0}
          filters={
            <>
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as typeof statusFilter);
                  setPage(1);
                }}
                className="rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
              >
                <option value="all">{t("billing.filters.allStatuses")}</option>
                <option value="active">{t("billing.status.active")}</option>
                <option value="trialing">{t("billing.status.trialing")}</option>
                <option value="past_due">{t("billing.status.past_due")}</option>
                <option value="grace_period">{t("billing.status.grace_period")}</option>
                <option value="expired">{t("billing.status.expired")}</option>
                <option value="canceled">{t("billing.status.canceled")}</option>
              </select>
              <select
                value={cycleFilter}
                onChange={(e) => {
                  setCycleFilter(e.target.value as typeof cycleFilter);
                  setPage(1);
                }}
                className="rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
              >
                <option value="all">{t("billing.filters.allCycles")}</option>
                <option value="monthly">{t("billing.filters.monthly")}</option>
                <option value="yearly">{t("billing.filters.yearly")}</option>
              </select>
            </>
          }
        />

        {isLoading ? (
          <DashboardTableSkeleton rows={8} />
        ) : rows.length === 0 ? (
          <BillingEmptyState title={t("billing.empty")} description={t("billing.emptyHint")} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("company")}>
                      {t("billing.tables.company")} <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("plan")}>
                      {t("billing.tables.plan")} <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </TableHead>
                  <TableHead>{t("billing.tables.cycle")}</TableHead>
                  <TableHead>
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("status")}>
                      {t("billing.tables.status")} <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("renewal")}>
                      {t("billing.tables.renewal")} <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </TableHead>
                  <TableHead className="text-end">{t("billing.tables.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row: CompanySubscription) => {
                  const planPrice =
                    row.billing_cycle === "yearly" ? row.plan?.price_yearly : row.plan?.price_monthly;
                  return (
                    <TableRow key={row.id} className={isFetching ? "opacity-80" : undefined}>
                      <TableCell>
                        <CompanyIdentityCompact
                          companyId={row.company_id}
                          name={row.company?.name ?? billingNotAvailable(t)}
                          logoUrl={row.company?.logo_url}
                          companyType={row.company?.company_type}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {row.plan?.display_name ?? row.plan?.name ?? t("billing.plan.unassigned")}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatBillingCurrency(planPrice ?? null)}</p>
                        </div>
                      </TableCell>
                      <TableCell>{translateBillingCycle(t, row.billing_cycle)}</TableCell>
                      <TableCell>
                        <SubscriptionStatusBadge
                          status={row.status}
                          currentPeriodEnd={row.current_period_end}
                          nextRenewalAt={row.next_renewal_at}
                          trialEndsAt={row.trial_ends_at}
                          gracePeriodEndsAt={row.grace_period_ends_at}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatBillingDate(row.next_renewal_at ?? row.current_period_end)}
                      </TableCell>
                      <TableCell className="text-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={billingDetailHref(row.company_id)} className="flex items-center gap-2">
                                <Eye className="h-4 w-4" />
                                {t("billing.actions.viewDetail")}
                              </Link>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <BillingPagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageInfoLabel={t("billing.pagination.pageInfo", { page, totalPages, total })}
          previousLabel={t("billing.pagination.previous")}
          nextLabel={t("billing.pagination.next")}
          onPrevious={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        />
      </DashboardCard>

      <AlertDialog open={enforcementConfirmOpen} onOpenChange={setEnforcementConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("billing.edit.runLifecycleEnforcement", "Run Lifecycle Enforcement")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "billing.edit.lifecycleEnforcementConfirm",
                "This batch evaluates overdue subscriptions, trials, and grace periods and applies existing lifecycle rules (limit {{limit}}). It does not charge customers or collect payment.",
                { limit: clampedEnforcementLimit },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={runLifecycleEnforcement.isPending}>
              {t("buttons.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={runLifecycleEnforcement.isPending}
              onClick={(event) => {
                event.preventDefault();
                void handleRunLifecycleEnforcement();
              }}
            >
              {runLifecycleEnforcement.isPending
                ? t("billing.common.loading")
                : t("billing.edit.runLifecycleEnforcementConfirm", "Run enforcement")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
