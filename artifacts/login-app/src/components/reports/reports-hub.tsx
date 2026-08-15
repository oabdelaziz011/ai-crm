import { useEffect, useMemo, useState } from "react";
import {
  BookmarkPlus,
  CalendarClock,
  Download,
  FileDown,
  LayoutDashboard,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QueryRefreshIndicator } from "@/components/ui/query-refresh-indicator";
import { BranchSelector } from "@/lib/company/branches/components";
import { useBranches } from "@/lib/company/branches/hooks";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useAvailableReports } from "@/hooks/reports/use-available-reports";
import { ReportViewer, useReportViewerData } from "@/components/reports/report-viewer";
import { ReportsCenterKpiGrid } from "@/components/reports/reports-center-kpi";
import {
  ReportsActivityChart,
  ReportsDonutCard,
  ReportsStatusBars,
} from "@/components/reports/reports-center-charts";
import { exportReportById } from "@/lib/reports/report-export";
import { exportReportPdf } from "@/lib/reports/report-pdf-export";
import {
  buildBookingMonthSeries,
  buildBookingStatusSlices,
  buildInvoiceStatusSlices,
  buildModuleMix,
  buildReportsCenterKpis,
  buildRevenueMonthSeries,
} from "@/lib/reports/reports-center-metrics";
import {
  REPORT_CATEGORY_ORDER,
  REPORT_CATEGORY_TITLE_KEYS,
} from "@/lib/reports/report-catalog";
import { defaultDateRange } from "@/lib/reports/reports-filters";
import {
  listReportSchedules,
  listSavedReportViews,
  saveReportSchedule,
  saveReportView,
  type SavedReportView,
} from "@/lib/reports/report-saved-views";
import { CUSTOMERS_KEY } from "@/hooks/use-customers";
import { BOOKINGS_KEY } from "@/hooks/use-bookings";
import { INVOICES_KEY } from "@/hooks/use-invoices";

function readReportQuery(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const value = params.get("report");
  return value && value.trim() ? value.trim() : null;
}

/**
 * Unified Reports Workspace:
 * Dropdown report picker + branch + date range + export/PDF + saved views + schedule drafts.
 */
export function ReportsHub() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const qc = useQueryClient();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const urlReport = readReportQuery(search);
  const [requestedId, setRequestedId] = useState<string | null>(urlReport);
  const { profile, user } = useAuth();
  const companyId = profile?.company_id ?? null;
  const userId = user?.id ?? null;
  const { data: branches = [] } = useBranches(companyId);
  const initialRange = defaultDateRange(30);
  const [branchFilter, setBranchFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string>(initialRange.from ?? "");
  const [dateTo, setDateTo] = useState<string>(initialRange.to ?? "");
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());
  const [saveOpen, setSaveOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [scheduleEmail, setScheduleEmail] = useState("");
  const [scheduleFreq, setScheduleFreq] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [savedViews, setSavedViews] = useState<SavedReportView[]>([]);

  useEffect(() => {
    setRequestedId(urlReport);
  }, [urlReport]);

  useEffect(() => {
    if (!companyId || !userId) return;
    setSavedViews(listSavedReportViews(companyId, userId));
  }, [companyId, userId, saveOpen]);

  const { available, selectedId, selected, isLoading } = useAvailableReports(requestedId);

  useEffect(() => {
    if (urlReport === "ai_operations" && selectedId === "ai_consumption") {
      setLocation("/reports?report=ai_consumption");
    }
  }, [selectedId, setLocation, urlReport]);

  const loadLeads = available.some((r) => r.id === "leads");
  const dateRange = {
    from: dateFrom || null,
    to: dateTo || null,
  };
  const model = useReportViewerData(selectedId, branchFilter, { loadLeads, dateRange });

  const groupedOptions = useMemo(() => {
    return REPORT_CATEGORY_ORDER.map((category) => ({
      category,
      titleKey: REPORT_CATEGORY_TITLE_KEYS[category],
      reports: available.filter((r) => r.category === category),
    })).filter((g) => g.reports.length > 0);
  }, [available]);

  const branchLabel = useMemo(() => {
    if (!branchFilter) return t("branches.selector.allBranches");
    return branches.find((b) => b.id === branchFilter)?.name ?? branchFilter;
  }, [branchFilter, branches, t]);

  const kpis = useMemo(
    () =>
      buildReportsCenterKpis({
        available,
        customers: model.customers ?? [],
        bookings: model.bookings,
        invoices: model.invoices,
        leadsCount: loadLeads ? model.leads.length : null,
      }),
    [available, loadLeads, model.bookings, model.customers, model.invoices, model.leads.length],
  );

  const bookingSeries = useMemo(() => buildBookingMonthSeries(model.bookings), [model.bookings]);
  const revenueSeries = useMemo(() => buildRevenueMonthSeries(model.invoices), [model.invoices]);
  const invoiceSlices = useMemo(() => buildInvoiceStatusSlices(model.invoices), [model.invoices]);
  const bookingSlices = useMemo(() => buildBookingStatusSlices(model.bookings), [model.bookings]);
  const moduleMix = useMemo(
    () =>
      buildModuleMix({
        available,
        customers: (model.customers ?? []).length,
        bookings: model.bookings.length,
        invoices: model.invoices.length,
        leads: model.leads.length,
      }),
    [available, model.bookings.length, model.customers, model.invoices.length, model.leads.length],
  );

  const selectReport = (id: string) => {
    setRequestedId(id);
    if (id === "overview") setLocation("/reports");
    else setLocation(`/reports?report=${encodeURIComponent(id)}`);
  };

  const handleRefresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY }),
      qc.invalidateQueries({ queryKey: BOOKINGS_KEY }),
      qc.invalidateQueries({ queryKey: INVOICES_KEY }),
      qc.invalidateQueries({ queryKey: ["leads-workspace"] }),
      qc.invalidateQueries({ queryKey: ["executive"] }),
      qc.invalidateQueries({ queryKey: ["companies"] }),
      qc.invalidateQueries({ queryKey: ["billing"] }),
      qc.invalidateQueries({ queryKey: ["opportunities-workspace"] }),
      qc.invalidateQueries({ queryKey: ["products-workspace"] }),
      qc.invalidateQueries({ queryKey: ["quotes-workspace"] }),
      qc.invalidateQueries({ queryKey: ["reports"] }),
      qc.invalidateQueries({ queryKey: ["tickets-workspace"] }),
      qc.invalidateQueries({ queryKey: ["ai-cost-aggregate"] }),
      qc.invalidateQueries({ queryKey: ["ai-cost-records"] }),
      qc.invalidateQueries({ queryKey: ["ai-analytics-aggregate"] }),
      qc.invalidateQueries({ queryKey: ["ai-analytics-records"] }),
    ]);
    setRefreshedAt(new Date());
  };

  const handleExportCsv = () => {
    if (!selectedId) return;
    const ok = exportReportById(selectedId, {
      overview: { ...model.overview, branchLabel },
      bookings: model.bookings,
      customers: model.customers ?? [],
      invoices: model.invoices,
      leads: model.leads,
      executive: model.executiveReport ?? null,
    });
    toast({
      variant: ok ? "default" : "destructive",
      title: ok
        ? t("dashboard.reports.exportSuccessTitle")
        : t("dashboard.reports.exportFailedTitle"),
      description: ok
        ? t("dashboard.reports.exportSuccessDescription")
        : t("dashboard.reports.exportFailedDescription"),
    });
  };

  const handleExportPdf = async () => {
    if (!selectedId || !selected?.supportsPdf) return;
    const ok = await exportReportPdf({
      reportId: selectedId,
      title: t(selected.titleKey),
      branchLabel,
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
      overview: model.overview,
      bookings: model.bookings,
      customers: model.customers ?? [],
      invoices: model.invoices,
      executive: model.executiveReport ?? null,
    });
    toast({
      variant: ok ? "default" : "destructive",
      title: ok
        ? t("dashboard.reports.pdfSuccessTitle", "PDF exported")
        : t("dashboard.reports.exportFailedTitle"),
    });
  };

  const handleSaveView = () => {
    if (!companyId || !userId || !selectedId || !viewName.trim()) return;
    saveReportView({
      name: viewName.trim(),
      companyId,
      userId,
      filters: {
        reportId: selectedId,
        branchId: branchFilter,
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
      },
    });
    setSavedViews(listSavedReportViews(companyId, userId));
    setSaveOpen(false);
    setViewName("");
    toast({ title: t("dashboard.reports.viewSaved", "View saved") });
  };

  const applySavedView = (view: SavedReportView) => {
    setBranchFilter(view.filters.branchId);
    setDateFrom(view.filters.dateFrom ?? "");
    setDateTo(view.filters.dateTo ?? "");
    selectReport(view.filters.reportId);
  };

  const handleSchedule = () => {
    if (!companyId || !userId || !selectedId || !scheduleEmail.trim()) return;
    saveReportSchedule({
      name: `${t(selected?.titleKey ?? "dashboard.reports.title")} · ${scheduleFreq}`,
      companyId,
      userId,
      reportId: selectedId,
      branchId: branchFilter,
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
      frequency: scheduleFreq,
      email: scheduleEmail.trim(),
      enabled: true,
    });
    setScheduleOpen(false);
    toast({
      title: t("dashboard.reports.scheduleSavedTitle", "Schedule saved"),
      description: t(
        "dashboard.reports.scheduleSavedDescription",
        "Email delivery runs when the reports scheduler worker is enabled for your environment.",
      ),
    });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("common.loading", "Loading…")}
      </div>
    );
  }

  if (available.length === 0 || !selected) {
    return (
      <div className="space-y-2 p-1">
        <h1 className="text-2xl font-bold">{t("dashboard.reports.centerTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("dashboard.reports.emptyCatalog")}</p>
      </div>
    );
  }

  const emptyData = t("dashboard.reports.center.emptyPeriod");
  const preferRevenue = available.some((r) => r.id === "invoices" || r.id === "financial");
  const showOverviewDashboard = selectedId === "overview";
  const schedules = companyId && userId ? listReportSchedules(companyId, userId) : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
            <LayoutDashboard className="h-3.5 w-3.5" />
            {t("dashboard.reports.centerBadge")}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.reports.centerTitle")}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {t(
              "dashboard.reports.centerSubtitleStrong",
              "Your single reports module — every report opens inline with live data, filtered by branch and date, according to your permissions.",
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {t("dashboard.reports.lastUpdated")}:{" "}
            <time dateTime={refreshedAt.toISOString()}>{refreshedAt.toLocaleString()}</time>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <QueryRefreshIndicator active={model.backgroundRefresh} />
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void handleRefresh()}>
            <RefreshCw className="h-3.5 w-3.5" />
            {t("dashboard.reports.refresh")}
          </Button>
        </div>
      </div>

      {/* Enterprise filter bar: Report dropdown + Branch + Date */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm lg:flex-row lg:flex-wrap lg:items-end">
        <div className="min-w-[220px] flex-1 space-y-1">
          <Label className="text-[11px] text-muted-foreground">
            {t("dashboard.reports.reportType", "Report")}
          </Label>
          <Select value={selectedId ?? undefined} onValueChange={selectReport}>
            <SelectTrigger className="h-10 w-full bg-background">
              <SelectValue placeholder={t("dashboard.reports.pickReport")} />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="max-h-[min(360px,70vh)] w-[var(--radix-select-trigger-width)]"
            >
              {groupedOptions.map((group) => (
                <SelectGroup key={group.category}>
                  <SelectLabel>{t(group.titleKey)}</SelectLabel>
                  {group.reports.map((report) => (
                    <SelectItem key={report.id} value={report.id}>
                      {t(report.titleKey)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selected.supportsBranchFilter ? (
          <div className="min-w-[170px] space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              {t("dashboard.reports.branchFilter")}
            </Label>
            <BranchSelector
              branches={branches}
              value={branchFilter}
              onChange={setBranchFilter}
              allowAll
              placeholder={t("branches.selector.allBranches")}
            />
          </div>
        ) : null}

        {selected.supportsDateFilter ? (
          <>
            <div className="min-w-[140px] space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                {t("dashboard.reports.dateFrom", "From")}
              </Label>
              <Input
                type="date"
                className="h-10"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="min-w-[140px] space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                {t("dashboard.reports.dateTo", "To")}
              </Label>
              <Input
                type="date"
                className="h-10"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </>
        ) : null}

        <div className="flex flex-wrap gap-2 lg:ms-auto">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setSaveOpen(true)}>
            <BookmarkPlus className="h-3.5 w-3.5" />
            {t("dashboard.reports.saveView", "Save view")}
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setScheduleOpen(true)}>
            <CalendarClock className="h-3.5 w-3.5" />
            {t("dashboard.reports.schedule", "Schedule")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" className="gap-1.5" disabled={model.loading}>
                <Download className="h-3.5 w-3.5" />
                {t("dashboard.reports.export")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {selected.supportsExport ? (
                <DropdownMenuItem onClick={handleExportCsv}>
                  <FileDown className="me-2 h-3.5 w-3.5" />
                  CSV
                </DropdownMenuItem>
              ) : null}
              {selected.supportsPdf ? (
                <DropdownMenuItem onClick={() => void handleExportPdf()}>
                  <FileDown className="me-2 h-3.5 w-3.5" />
                  PDF
                </DropdownMenuItem>
              ) : null}
              {!selected.supportsExport && !selected.supportsPdf ? (
                <DropdownMenuItem disabled>
                  {t("dashboard.reports.exportUnavailable", "Export not available for this report")}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Saved views chips */}
      {savedViews.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t("dashboard.reports.savedViews", "Saved views")}:
          </span>
          {savedViews.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => applySavedView(view)}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-xs hover:border-primary/40"
            >
              {view.name}
            </button>
          ))}
        </div>
      ) : null}

      <p className="text-sm text-muted-foreground">{t(selected.descriptionKey)}</p>

      {/* Body */}
      {showOverviewDashboard ? (
        <div className="space-y-4">
          <ReportsCenterKpiGrid kpis={kpis} loading={model.loading} onSelect={selectReport} />
          <div className="grid gap-3 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <ReportsActivityChart
                title={
                  preferRevenue
                    ? t("dashboard.reports.center.revenueOverTime")
                    : t("dashboard.reports.bookingsPerMonth")
                }
                data={preferRevenue ? revenueSeries : bookingSeries}
                emptyLabel={emptyData}
              />
            </div>
            <div className="lg:col-span-2">
              {available.some((r) => r.id === "invoices") ? (
                <ReportsStatusBars
                  title={t("dashboard.reports.invoiceBreakdown")}
                  slices={invoiceSlices}
                  emptyLabel={emptyData}
                />
              ) : (
                <ReportsStatusBars
                  title={t("dashboard.reports.center.bookingStatus")}
                  slices={bookingSlices}
                  emptyLabel={emptyData}
                />
              )}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {moduleMix.length > 0 ? (
              <ReportsDonutCard
                title={t("dashboard.reports.center.moduleMix")}
                slices={moduleMix}
                emptyLabel={emptyData}
              />
            ) : null}
            {available.some((r) => r.id === "bookings") ? (
              <ReportsDonutCard
                title={t("dashboard.reports.center.bookingStatus")}
                slices={bookingSlices}
                emptyLabel={emptyData}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <ReportViewer report={selected} model={model} />
      )}

      {schedules.length > 0 ? (
        <div className="rounded-xl border border-border bg-card p-3 text-sm">
          <h3 className="mb-2 font-semibold">
            {t("dashboard.reports.scheduledTitle", "Scheduled reports")}
          </h3>
          <ul className="space-y-1 text-muted-foreground">
            {schedules.map((s) => (
              <li key={s.id}>
                {s.name} · {s.email} · {s.frequency}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Save view dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboard.reports.saveView", "Save view")}</DialogTitle>
          </DialogHeader>
          <Input
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            placeholder={t("dashboard.reports.viewNamePlaceholder", "e.g. Bookings this month")}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
              {t("buttons.cancel", "Cancel")}
            </Button>
            <Button type="button" onClick={handleSaveView}>
              {t("buttons.save", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboard.reports.schedule", "Schedule")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("dashboard.reports.scheduleEmail", "Email")}</Label>
              <Input
                type="email"
                value={scheduleEmail}
                onChange={(e) => setScheduleEmail(e.target.value)}
                placeholder="billing@company.com"
              />
            </div>
            <div className="space-y-1">
              <Label>{t("dashboard.reports.scheduleFrequency", "Frequency")}</Label>
              <Select
                value={scheduleFreq}
                onValueChange={(v) => setScheduleFreq(v as "daily" | "weekly" | "monthly")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">{t("dashboard.reports.freqDaily", "Daily")}</SelectItem>
                  <SelectItem value="weekly">{t("dashboard.reports.freqWeekly", "Weekly")}</SelectItem>
                  <SelectItem value="monthly">{t("dashboard.reports.freqMonthly", "Monthly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "dashboard.reports.scheduleHint",
                "Saves the schedule for this report and filters. Delivery starts when the email worker is enabled.",
              )}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setScheduleOpen(false)}>
              {t("buttons.cancel", "Cancel")}
            </Button>
            <Button type="button" onClick={handleSchedule}>
              {t("buttons.save", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
