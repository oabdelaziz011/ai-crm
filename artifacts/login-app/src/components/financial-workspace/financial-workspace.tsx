import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileText,
  Plus,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DashboardCard, DashboardErrorBanner, DashboardStatCard } from "@/components/dashboard/ui";
import { InvoiceModal } from "@/components/dashboard/invoice-modal";
import { Can } from "@/components/rbac/permission-guard";
import { useAuth } from "@/context/auth-context";
import { useCompanyLocaleContext } from "@/context/company-locale-context";
import { useToast } from "@/hooks/use-toast";
import { useHasPermission } from "@/hooks/use-rbac";
import { useCustomersEnrichment } from "@/hooks/use-customers";
import {
  useFinancialDashboard,
  useFinancialInvoices,
  useFinancialPayments,
} from "@/lib/billing/hooks/use-financial-dashboard";
import {
  financialInvoicesKey,
  financialMetricsKey,
  financialPaymentsKey,
  financialRefundsKey,
} from "@/lib/billing/cache/query-keys";
import { downloadCsv } from "@/lib/billing/export-csv";
import { getFinancialPlatformServices } from "@/lib/billing/services/financial-platform-service";
import type { CustomerInvoice, CustomerPayment } from "@/lib/billing/types/financial-types";
import type { PaymentMethodType } from "@/lib/billing/types/financial-enums";
import type { Invoice } from "@/lib/types";
import {
  buildCustomerFinancialAccounts,
  buildFinancialWorkspaceKpis,
  buildInvoicePaymentMonthSeries,
  buildInvoiceStatusSlices,
  buildPaymentStatusSlices,
  isInvoiceOverdue,
  remainingInvoiceCents,
} from "@/lib/financial-workspace/financial-workspace-metrics";
import { recordManualCustomerPayment } from "@/lib/financial-workspace/record-manual-payment";
import { cn } from "@/lib/utils";

export type FinancialWorkspaceTab =
  | "overview"
  | "invoices"
  | "payments"
  | "receipts"
  | "accounts"
  | "reports";

const TAB_IDS: FinancialWorkspaceTab[] = [
  "overview",
  "invoices",
  "payments",
  "receipts",
  "accounts",
  "reports",
];

function readTab(search: string): FinancialWorkspaceTab {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const raw = (params.get("tab") ?? "overview").trim();
  return TAB_IDS.includes(raw as FinancialWorkspaceTab) ? (raw as FinancialWorkspaceTab) : "overview";
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger" | "muted" | "info";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold",
        tone === "success" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        tone === "warning" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        tone === "danger" && "bg-rose-500/15 text-rose-700 dark:text-rose-300",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "info" && "bg-sky-500/15 text-sky-700 dark:text-sky-300",
      )}
    >
      {children}
    </span>
  );
}

function invoiceTone(status: string): "success" | "warning" | "danger" | "muted" | "info" {
  if (status === "paid") return "success";
  if (status === "partially_paid" || status === "issued" || status === "pending") return "warning";
  if (status === "cancelled" || status === "draft") return "muted";
  if (status === "refunded") return "info";
  return "muted";
}

function paymentTone(status: string): "success" | "warning" | "danger" | "muted" | "info" {
  if (status === "completed") return "success";
  if (status === "pending" || status === "processing") return "warning";
  if (status === "failed") return "danger";
  if (status === "refunded" || status === "partially_refunded") return "info";
  return "muted";
}

function StatusBars({
  title,
  slices,
  empty,
  t,
}: {
  title: string;
  slices: Array<{ id: string; labelKey: string; value: number; color: string }>;
  empty: string;
  t: (key: string, fallback?: string) => string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  return (
    <DashboardCard className="p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {total === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-2.5">
          {slices.map((slice) => {
            const pct = Math.round((slice.value / total) * 100);
            return (
              <div key={slice.id}>
                <div className="mb-1 flex justify-between text-xs">
                  <span>{t(slice.labelKey, slice.id)}</span>
                  <span className="font-mono text-muted-foreground">
                    {slice.value} · {pct}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", slice.color)} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardCard>
  );
}

function DualLineChart({
  title,
  points,
  empty,
  invoicedLabel,
  paidLabel,
}: {
  title: string;
  points: Array<{ label: string; invoicedCents: number; paidCents: number }>;
  empty: string;
  invoicedLabel: string;
  paidLabel: string;
}) {
  const max = Math.max(...points.flatMap((p) => [p.invoicedCents, p.paidCents]), 1);
  const hasData = points.some((p) => p.invoicedCents > 0 || p.paidCents > 0);
  return (
    <DashboardCard className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary/80" /> {invoicedLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" /> {paidLabel}
          </span>
        </div>
      </div>
      {!hasData ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="flex h-40 items-end gap-2">
          {points.map((point) => (
            <div key={point.label} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-28 w-full items-end justify-center gap-0.5">
                <div
                  className="w-[40%] rounded-t bg-primary/75"
                  style={{
                    height: `${(point.invoicedCents / max) * 100}%`,
                    minHeight: point.invoicedCents > 0 ? 3 : 0,
                  }}
                />
                <div
                  className="w-[40%] rounded-t bg-emerald-500"
                  style={{
                    height: `${(point.paidCents / max) * 100}%`,
                    minHeight: point.paidCents > 0 ? 3 : 0,
                  }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{point.label}</span>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}

export function FinancialWorkspace({ initialTab }: { initialTab?: FinancialWorkspaceTab } = {}) {
  const { t } = useTranslation("common");
  const search = useSearch();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { profile, user } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { currency: companyCurrency, formatMoney: formatCompanyMoney } = useCompanyLocaleContext();
  const canCreate = useHasPermission("invoices.create");
  const canEdit = useHasPermission("invoices.edit");

  const [tab, setTab] = useState<FinancialWorkspaceTab>(initialTab ?? readTab(search));
  const [query, setQuery] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState<string>("all");
  const [paymentStatus, setPaymentStatus] = useState<string>("all");
  const [invoiceModal, setInvoiceModal] = useState<{ open: boolean; invoice?: Invoice | null }>({
    open: false,
  });
  const [selectedInvoice, setSelectedInvoice] = useState<CustomerInvoice | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<CustomerInvoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payInvoice, setPayInvoice] = useState<CustomerInvoice | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethodType>("cash");
  const [payBusy, setPayBusy] = useState(false);

  useEffect(() => {
    setTab(initialTab ?? readTab(search));
  }, [initialTab, search]);

  useEffect(() => {
    if (!companyId || !selectedInvoice) {
      setDetailInvoice(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void getFinancialPlatformServices()
      .invoices.getById(companyId, selectedInvoice.id)
      .then((full) => {
        if (!cancelled) setDetailInvoice(full ?? selectedInvoice);
      })
      .catch(() => {
        if (!cancelled) setDetailInvoice(selectedInvoice);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, selectedInvoice]);

  const dashboard = useFinancialDashboard(companyId);
  const invoicesQuery = useFinancialInvoices(companyId, 300);
  const paymentsQuery = useFinancialPayments(companyId, 300);
  const { data: customers = [] } = useCustomersEnrichment();

  const invoices = invoicesQuery.data ?? [];
  const payments = paymentsQuery.data ?? [];
  // Always display using company billing settings currency (not stored invoice/payment defaults).
  const currency = companyCurrency || "USD";

  const customerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers) map.set(c.id, c.name);
    return map;
  }, [customers]);

  const kpis = useMemo(
    () =>
      buildFinancialWorkspaceKpis({
        metrics: dashboard.metrics.data,
        invoices,
        payments,
        currency,
      }),
    [currency, dashboard.metrics.data, invoices, payments],
  );

  const monthSeries = useMemo(
    () => buildInvoicePaymentMonthSeries(invoices, payments),
    [invoices, payments],
  );
  const invoiceSlices = useMemo(() => buildInvoiceStatusSlices(invoices), [invoices]);
  const paymentSlices = useMemo(() => buildPaymentStatusSlices(payments), [payments]);
  const accounts = useMemo(
    () =>
      buildCustomerFinancialAccounts({
        invoices,
        payments,
        customerNameById,
        currency,
      }),
    [currency, customerNameById, invoices, payments],
  );

  const filteredInvoices = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (invoiceStatus !== "all" && inv.status !== invoiceStatus) return false;
      if (!q) return true;
      const name = inv.customerId ? customerNameById.get(inv.customerId) ?? "" : "";
      return (
        (inv.invoiceNumber ?? "").toLowerCase().includes(q) ||
        inv.id.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q)
      );
    });
  }, [customerNameById, invoiceStatus, invoices, query]);

  const filteredPayments = useMemo(() => {
    const q = query.trim().toLowerCase();
    return payments.filter((pay) => {
      if (paymentStatus !== "all" && pay.status !== paymentStatus) return false;
      if (!q) return true;
      const name = pay.customerId ? customerNameById.get(pay.customerId) ?? "" : "";
      return (
        pay.id.toLowerCase().includes(q) ||
        pay.invoiceId.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q) ||
        pay.paymentMethod.toLowerCase().includes(q)
      );
    });
  }, [customerNameById, paymentStatus, payments, query]);

  const receiptRows = useMemo(() => {
    return payments
      .filter((p) => p.status === "completed")
      .map((p) => ({
        id: p.id,
        customerName: p.customerId ? customerNameById.get(p.customerId) ?? "—" : "—",
        invoiceId: p.invoiceId,
        invoiceNumber:
          invoices.find((i) => i.id === p.invoiceId)?.invoiceNumber ?? p.invoiceId.slice(0, 8),
        amountCents: p.amountCents,
        currency: p.currency,
        method: p.paymentMethod,
        date: (p.paidAt || p.createdAt).slice(0, 10),
      }));
  }, [customerNameById, invoices, payments]);

  const loading = dashboard.isLoading || invoicesQuery.isLoading || paymentsQuery.isLoading;
  const error = invoicesQuery.error ?? paymentsQuery.error ?? dashboard.metrics.error;

  const money = (cents: number) => formatCompanyMoney(cents, currency);

  const kpiIcon = (icon: string) => {
    switch (icon) {
      case "invoices":
        return FileText;
      case "billed":
        return TrendingUp;
      case "paid":
        return CheckCircle2;
      case "due":
        return Clock;
      case "overdue":
        return AlertCircle;
      case "collection":
        return Wallet;
      default:
        return CreditCard;
    }
  };

  const handleRefresh = async () => {
    if (!companyId) return;
    await Promise.all([
      qc.invalidateQueries({ queryKey: financialMetricsKey(companyId) }),
      qc.invalidateQueries({ queryKey: financialInvoicesKey(companyId) }),
      qc.invalidateQueries({ queryKey: financialPaymentsKey(companyId) }),
      qc.invalidateQueries({ queryKey: financialRefundsKey(companyId) }),
    ]);
  };

  const handleExport = () => {
    if (tab === "payments") {
      downloadCsv(
        `financial-payments-${new Date().toISOString().slice(0, 10)}.csv`,
        ["id", "invoice_id", "customer_id", "amount_cents", "currency", "method", "status", "paid_at"],
        filteredPayments.map((p) => [
          p.id,
          p.invoiceId,
          p.customerId ?? "",
          String(p.amountCents),
          p.currency,
          p.paymentMethod,
          p.status,
          p.paidAt ?? "",
        ]),
      );
    } else if (tab === "accounts") {
      downloadCsv(
        `financial-accounts-${new Date().toISOString().slice(0, 10)}.csv`,
        ["customer", "invoices", "billed_cents", "paid_cents", "due_cents", "overdue_cents"],
        accounts.map((a) => [
          a.customerName,
          String(a.invoiceCount),
          String(a.billedCents),
          String(a.paidCents),
          String(a.dueCents),
          String(a.overdueCents),
        ]),
      );
    } else {
      downloadCsv(
        `financial-invoices-${new Date().toISOString().slice(0, 10)}.csv`,
        ["number", "customer", "status", "total_cents", "paid_cents", "remaining_cents", "due_at", "currency"],
        filteredInvoices.map((inv) => [
          inv.invoiceNumber ?? inv.id,
          inv.customerId ? customerNameById.get(inv.customerId) ?? "" : "",
          inv.status,
          String(inv.totalCents),
          String(inv.paidCents),
          String(remainingInvoiceCents(inv)),
          inv.dueAt ?? "",
          inv.currency,
        ]),
      );
    }
    toast({ title: t("financialWorkspace.exportStarted", "Export started") });
  };

  const openRecordPayment = (inv: CustomerInvoice) => {
    setPayInvoice(inv);
    setPayAmount(String(remainingInvoiceCents(inv) / 100));
    setPayMethod("cash");
    setPayOpen(true);
  };

  const submitPayment = async () => {
    if (!companyId || !payInvoice) return;
    const customerId = payInvoice.customerId?.trim() || null;
    if (!customerId) {
      toast({
        variant: "destructive",
        title: t("financialWorkspace.paymentFailed"),
        description: t("financialWorkspace.paymentNeedsCustomer"),
      });
      return;
    }
    const amountCents = Math.round((Number(payAmount) || 0) * 100);
    if (amountCents <= 0) return;
    setPayBusy(true);
    try {
      await recordManualCustomerPayment({
        companyId,
        invoiceId: payInvoice.id,
        customerId,
        amountCents,
        currency: companyCurrency || payInvoice.currency,
        paymentMethod: payMethod,
        createdBy: user?.id ?? null,
      });
      setPayOpen(false);
      await handleRefresh();
      toast({ title: t("financialWorkspace.paymentRecorded", "Payment recorded") });
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("financialWorkspace.paymentFailed", "Could not record payment"),
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setPayBusy(false);
    }
  };

  const onTabChange = (value: string) => {
    const next = value as FinancialWorkspaceTab;
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
  };

  if (!companyId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        {t("financial.noCompany")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{t("financialWorkspace.title")}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t("financialWorkspace.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void handleRefresh()}>
            <RefreshCw className="h-3.5 w-3.5" />
            {t("financialWorkspace.refresh", "Refresh")}
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleExport} disabled={loading}>
            <Download className="h-3.5 w-3.5" />
            {t("financialWorkspace.export", "Export")}
          </Button>
          <Can permission="invoices.edit">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!selectedInvoice && filteredInvoices.filter((i) => remainingInvoiceCents(i) > 0).length === 0}
              onClick={() => {
                const inv =
                  selectedInvoice && remainingInvoiceCents(selectedInvoice) > 0
                    ? selectedInvoice
                    : filteredInvoices.find((i) => remainingInvoiceCents(i) > 0) ?? null;
                if (inv) openRecordPayment(inv);
              }}
            >
              <Wallet className="h-3.5 w-3.5" />
              {t("financialWorkspace.recordPayment", "Record payment")}
            </Button>
          </Can>
          <Can permission="invoices.create">
            <Button type="button" size="sm" className="gap-1.5" onClick={() => setInvoiceModal({ open: true, invoice: null })}>
              <Plus className="h-3.5 w-3.5" />
              {t("financialWorkspace.createInvoice", "Create invoice")}
            </Button>
          </Can>
        </div>
      </div>

      {error ? (
        <DashboardErrorBanner
          message={error instanceof Error ? error.message : t("financialWorkspace.loadError", "Could not load financial data")}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        {kpis.map((kpi) => (
          <DashboardStatCard
            key={kpi.id}
            label={t(kpi.labelKey)}
            value={
              kpi.format === "money"
                ? money(kpi.valueCents)
                : kpi.format === "percent"
                  ? `${kpi.valueNumber ?? 0}%`
                  : (kpi.valueNumber ?? 0)
            }
            icon={kpiIcon(kpi.icon)}
            loading={loading}
          />
        ))}
      </div>

      <Tabs value={tab} onValueChange={onTabChange} className="space-y-3">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
          {TAB_IDS.map((id) => (
            <TabsTrigger key={id} value={id} className="text-xs sm:text-sm">
              {t(`financialWorkspace.tabs.${id}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2.5 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("financialWorkspace.searchPlaceholder")}
              className="h-9 ps-8"
            />
          </div>
          {(tab === "overview" || tab === "invoices" || tab === "reports") && (
            <Select value={invoiceStatus} onValueChange={setInvoiceStatus}>
              <SelectTrigger className="h-9 w-full sm:w-[180px]">
                <SelectValue placeholder={t("financialWorkspace.filters.invoiceStatus")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("financialWorkspace.filters.allStatuses")}</SelectItem>
                {["draft", "pending", "issued", "partially_paid", "paid", "cancelled", "refunded"].map(
                  (s) => (
                    <SelectItem key={s} value={s}>
                      {t(`financialWorkspace.status.invoice.${s}`, s)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          )}
          {(tab === "payments" || tab === "receipts") && (
            <Select value={paymentStatus} onValueChange={setPaymentStatus}>
              <SelectTrigger className="h-9 w-full sm:w-[180px]">
                <SelectValue placeholder={t("financialWorkspace.filters.paymentStatus")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("financialWorkspace.filters.allStatuses")}</SelectItem>
                {["pending", "processing", "completed", "failed", "refunded", "partially_refunded"].map(
                  (s) => (
                    <SelectItem key={s} value={s}>
                      {t(`financialWorkspace.status.payment.${s}`, s)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              setInvoiceStatus("all");
              setPaymentStatus("all");
            }}
          >
            {t("financialWorkspace.resetFilters", "Reset")}
          </Button>
        </div>

        <TabsContent value="overview" className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <DualLineChart
                title={t("financialWorkspace.charts.overTime")}
                points={monthSeries}
                empty={t("financialWorkspace.empty.charts")}
                invoicedLabel={t("financialWorkspace.charts.invoiced")}
                paidLabel={t("financialWorkspace.charts.paid")}
              />
            </div>
            <div className="grid gap-3 lg:col-span-2">
              <StatusBars
                title={t("financialWorkspace.charts.invoiceStatus")}
                slices={invoiceSlices}
                empty={t("financialWorkspace.empty.invoices")}
                t={t}
              />
              <StatusBars
                title={t("financialWorkspace.charts.paymentStatus")}
                slices={paymentSlices}
                empty={t("financialWorkspace.empty.payments")}
                t={t}
              />
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <InvoiceTable
              title={t("financialWorkspace.recentInvoices")}
              rows={filteredInvoices.slice(0, 8)}
              customerNameById={customerNameById}
              money={money}
              t={t}
              onSelect={setSelectedInvoice}
              onPay={canEdit ? openRecordPayment : undefined}
              compact
            />
            <PaymentTable
              title={t("financialWorkspace.recentPayments")}
              rows={filteredPayments.slice(0, 8)}
              customerNameById={customerNameById}
              invoiceNumberById={new Map(invoices.map((i) => [i.id, i.invoiceNumber ?? i.id.slice(0, 8)]))}
              money={money}
              t={t}
              compact
            />
          </div>
        </TabsContent>

        <TabsContent value="invoices">
          <InvoiceTable
            title={t("financialWorkspace.tabs.invoices")}
            rows={filteredInvoices}
            customerNameById={customerNameById}
            money={money}
            t={t}
            onSelect={setSelectedInvoice}
            onPay={canEdit ? openRecordPayment : undefined}
            onEdit={
              canEdit
                ? (inv) =>
                    setInvoiceModal({
                      open: true,
                      invoice: {
                        id: inv.id,
                        user_id: "",
                        customer_id: inv.customerId,
                        amount: inv.totalCents / 100,
                        status: inv.status === "paid" ? "Paid" : "Unpaid",
                        invoice_date: inv.issuedAt || inv.createdAt,
                        created_at: inv.createdAt,
                        updated_at: inv.updatedAt,
                      } as Invoice,
                    })
                : undefined
            }
          />
        </TabsContent>

        <TabsContent value="payments">
          <PaymentTable
            title={t("financialWorkspace.tabs.payments")}
            rows={filteredPayments}
            customerNameById={customerNameById}
            invoiceNumberById={new Map(invoices.map((i) => [i.id, i.invoiceNumber ?? i.id.slice(0, 8)]))}
            money={money}
            t={t}
          />
        </TabsContent>

        <TabsContent value="receipts">
          <DashboardCard className="overflow-hidden p-0">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">{t("financialWorkspace.tabs.receipts")}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("financialWorkspace.receiptsHint")}
              </p>
            </div>
            {receiptRows.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {t("financialWorkspace.empty.receipts")}
              </p>
            ) : (
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="sticky top-0 bg-muted/80 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                    <tr>
                      <th className="px-3 py-2 text-start">{t("financialWorkspace.cols.receipt")}</th>
                      <th className="px-3 py-2 text-start">{t("financialWorkspace.cols.customer")}</th>
                      <th className="px-3 py-2 text-start">{t("financialWorkspace.cols.invoice")}</th>
                      <th className="px-3 py-2 text-end">{t("financialWorkspace.cols.amount")}</th>
                      <th className="px-3 py-2 text-start">{t("financialWorkspace.cols.method")}</th>
                      <th className="px-3 py-2 text-start">{t("financialWorkspace.cols.date")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptRows.map((row) => (
                      <tr key={row.id} className="border-t border-border/70">
                        <td className="px-3 py-2 font-mono text-xs">{row.id.slice(0, 8)}</td>
                        <td className="px-3 py-2">{row.customerName}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.invoiceNumber}</td>
                        <td className="px-3 py-2 text-end font-mono">{money(row.amountCents)}</td>
                        <td className="px-3 py-2">{t(`financialWorkspace.method.${row.method}`, row.method)}</td>
                        <td className="px-3 py-2">{row.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DashboardCard>
        </TabsContent>

        <TabsContent value="accounts">
          <DashboardCard className="overflow-hidden p-0">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">{t("financialWorkspace.tabs.accounts")}</h3>
            </div>
            {accounts.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {t("financialWorkspace.empty.accounts")}
              </p>
            ) : (
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full min-w-[800px] text-sm">
                  <thead className="sticky top-0 bg-muted/80 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                    <tr>
                      <th className="px-3 py-2 text-start">{t("financialWorkspace.cols.customer")}</th>
                      <th className="px-3 py-2 text-end">{t("financialWorkspace.cols.invoices")}</th>
                      <th className="px-3 py-2 text-end">{t("financialWorkspace.cols.billed")}</th>
                      <th className="px-3 py-2 text-end">{t("financialWorkspace.cols.paid")}</th>
                      <th className="px-3 py-2 text-end">{t("financialWorkspace.cols.due")}</th>
                      <th className="px-3 py-2 text-end">{t("financialWorkspace.cols.overdue")}</th>
                      <th className="px-3 py-2 text-start">{t("financialWorkspace.cols.lastActivity")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((row) => (
                      <tr key={row.customerId} className="border-t border-border/70">
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            {row.customerName}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-end font-mono">{row.invoiceCount}</td>
                        <td className="px-3 py-2 text-end font-mono">{money(row.billedCents)}</td>
                        <td className="px-3 py-2 text-end font-mono">{money(row.paidCents)}</td>
                        <td className="px-3 py-2 text-end font-mono">{money(row.dueCents)}</td>
                        <td className="px-3 py-2 text-end font-mono">{money(row.overdueCents)}</td>
                        <td className="px-3 py-2">{row.lastActivityAt?.slice(0, 10) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DashboardCard>
        </TabsContent>

        <TabsContent value="reports" className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[
              {
                id: "sales",
                title: t("financialWorkspace.reports.sales"),
                value: money(kpis.find((k) => k.id === "billed")?.valueCents ?? 0),
              },
              {
                id: "collection",
                title: t("financialWorkspace.reports.collection"),
                value: money(kpis.find((k) => k.id === "paid")?.valueCents ?? 0),
              },
              {
                id: "overdue",
                title: t("financialWorkspace.reports.overdue"),
                value: money(kpis.find((k) => k.id === "overdue")?.valueCents ?? 0),
              },
              {
                id: "due",
                title: t("financialWorkspace.reports.due"),
                value: money(kpis.find((k) => k.id === "due")?.valueCents ?? 0),
              },
              {
                id: "debtors",
                title: t("financialWorkspace.reports.debtors"),
                value: String(accounts.filter((a) => a.dueCents > 0).length),
              },
              {
                id: "avg",
                title: t("financialWorkspace.reports.average"),
                value: money(kpis.find((k) => k.id === "average")?.valueCents ?? 0),
              },
            ].map((card) => (
              <DashboardCard key={card.id} className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {card.title}
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{card.value}</p>
              </DashboardCard>
            ))}
          </div>
          <StatusBars
            title={t("financialWorkspace.charts.invoiceStatus")}
            slices={invoiceSlices}
            empty={t("financialWorkspace.empty.invoices")}
            t={t}
          />
        </TabsContent>
      </Tabs>

      {/* Invoice detail */}
      <Dialog open={Boolean(selectedInvoice)} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedInvoice ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {(detailInvoice ?? selectedInvoice).invoiceNumber ??
                    selectedInvoice.id.slice(0, 8)}
                </DialogTitle>
              </DialogHeader>
              {detailLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("financialWorkspace.loadingDetail")}
                </p>
              ) : (
                <div className="space-y-4 text-sm">
                  {(() => {
                    const inv = detailInvoice ?? selectedInvoice;
                    return (
                      <>
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge tone={invoiceTone(inv.status)}>
                            {t(`financialWorkspace.status.invoice.${inv.status}`, inv.status)}
                          </StatusBadge>
                          {isInvoiceOverdue(inv) ? (
                            <StatusBadge tone="danger">{t("financialWorkspace.overdueBadge")}</StatusBadge>
                          ) : null}
                        </div>

                        {/* Meta: start = العميل / تاريخ الاستحقاق · end = التاريخ */}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs text-muted-foreground">{t("financialWorkspace.cols.customer")}</p>
                              <p className="font-medium">
                                {inv.customerId ? customerNameById.get(inv.customerId) ?? "—" : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">{t("financialWorkspace.cols.dueDate")}</p>
                              <p className="font-medium">
                                {(inv.dueAt || inv.issuedAt || inv.createdAt)?.slice(0, 10) ?? "—"}
                              </p>
                            </div>
                          </div>
                          <div className="space-y-3 sm:text-end">
                            <div>
                              <p className="text-xs text-muted-foreground">{t("financialWorkspace.cols.date")}</p>
                              <p className="font-medium">
                                {(inv.issuedAt || inv.createdAt).slice(0, 10)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Financial totals — label start, amount end */}
                        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                          <ul className="space-y-1.5">
                            {(
                              [
                                ["subtotal", inv.subtotalCents],
                                ["discount", inv.discountCents],
                                ["tax", inv.taxCents],
                                ["total", inv.totalCents],
                                ["paid", inv.paidCents],
                                ["remaining", remainingInvoiceCents(inv)],
                              ] as const
                            ).map(([key, cents]) => (
                              <li
                                key={key}
                                className={cn(
                                  "flex items-center justify-between gap-3",
                                  key === "total" || key === "remaining"
                                    ? "border-t border-border/70 pt-1.5 font-semibold"
                                    : null,
                                )}
                              >
                                <span className="text-muted-foreground">
                                  {t(`financialWorkspace.cols.${key}`)}
                                </span>
                                <span className="font-mono tabular-nums">{money(cents)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {(detailInvoice?.lineItems?.length ?? 0) > 0 ? (
                          <div>
                            <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                              {t("financialWorkspace.lineItems")}
                            </p>
                            <div className="overflow-auto rounded-md border border-border">
                              <table className="w-full text-xs">
                                <thead className="bg-muted/60 text-muted-foreground">
                                  <tr>
                                    <th className="px-2 py-1.5 text-start">
                                      {t("financialWorkspace.cols.description")}
                                    </th>
                                    <th className="px-2 py-1.5 text-end">{t("financialWorkspace.cols.qty")}</th>
                                    <th className="px-2 py-1.5 text-end">
                                      {t("financialWorkspace.cols.unitPrice")}
                                    </th>
                                    <th className="px-2 py-1.5 text-end">{t("financialWorkspace.cols.total")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detailInvoice!.lineItems.map((item, idx) => (
                                    <tr key={item.id ?? idx} className="border-t border-border/70">
                                      <td className="px-2 py-1.5">{item.description}</td>
                                      <td className="px-2 py-1.5 text-end font-mono">{item.quantity}</td>
                                      <td className="px-2 py-1.5 text-end font-mono">
                                        {money(item.unitPriceCents)}
                                      </td>
                                      <td className="px-2 py-1.5 text-end font-mono">
                                        {money(item.totalCents)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : null}

                        <div>
                          <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                            {t("financialWorkspace.paymentHistory")}
                          </p>
                          <ul className="space-y-1.5">
                            {payments.filter((p) => p.invoiceId === selectedInvoice.id).length === 0 ? (
                              <li className="text-muted-foreground">{t("financialWorkspace.empty.payments")}</li>
                            ) : (
                              payments
                                .filter((p) => p.invoiceId === selectedInvoice.id)
                                .map((p) => (
                                  <li
                                    key={p.id}
                                    className="flex justify-between gap-3 rounded-md border border-border px-2.5 py-1.5"
                                  >
                                    <span>
                                      {t(`financialWorkspace.method.${p.paymentMethod}`, p.paymentMethod)} ·{" "}
                                      {t(`financialWorkspace.status.payment.${p.status}`, p.status)}
                                    </span>
                                    <span className="font-mono tabular-nums">{money(p.amountCents)}</span>
                                  </li>
                                ))
                            )}
                          </ul>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
              <DialogFooter>
                {canEdit && remainingInvoiceCents(detailInvoice ?? selectedInvoice) > 0 ? (
                  <Button
                    type="button"
                    onClick={() => {
                      openRecordPayment(detailInvoice ?? selectedInvoice);
                      setSelectedInvoice(null);
                    }}
                  >
                    {t("financialWorkspace.recordPayment")}
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("financialWorkspace.recordPayment")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {payInvoice?.invoiceNumber ?? payInvoice?.id.slice(0, 8)} ·{" "}
              {t("financialWorkspace.cols.remaining")}:{" "}
              {payInvoice ? money(remainingInvoiceCents(payInvoice)) : "—"}
            </p>
            <div className="space-y-1">
              <Label>{t("financialWorkspace.cols.amount")}</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("financialWorkspace.cols.method")}</Label>
              <Select value={payMethod} onValueChange={(v) => setPayMethod(v as PaymentMethodType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["cash", "card", "bank_transfer", "wallet", "online", "mixed"] as const).map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`financialWorkspace.method.${m}`, m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPayOpen(false)}>
              {t("buttons.cancel", "Cancel")}
            </Button>
            <Button type="button" disabled={payBusy || !canEdit} onClick={() => void submitPayment()}>
              {t("buttons.save", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canCreate || canEdit ? (
        <InvoiceModal
          open={invoiceModal.open}
          invoice={invoiceModal.invoice}
          customers={customers}
          onClose={() => setInvoiceModal({ open: false })}
        />
      ) : null}
    </div>
  );
}

function InvoiceTable({
  title,
  rows,
  customerNameById,
  money,
  t,
  onSelect,
  onPay,
  onEdit,
  compact,
}: {
  title: string;
  rows: CustomerInvoice[];
  customerNameById: Map<string, string>;
  money: (cents: number) => string;
  t: (key: string, fallback?: string) => string;
  onSelect: (inv: CustomerInvoice) => void;
  onPay?: (inv: CustomerInvoice) => void;
  onEdit?: (inv: CustomerInvoice) => void;
  compact?: boolean;
}) {
  return (
    <DashboardCard className="overflow-hidden p-0">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          {t("financialWorkspace.empty.invoices")}
        </p>
      ) : (
        <div className={cn("overflow-auto", compact ? "max-h-[320px]" : "max-h-[560px]")}>
          <table className="w-full min-w-[880px] text-sm">
            <thead className="sticky top-0 bg-muted/80 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-3 py-2 text-start">{t("financialWorkspace.cols.invoice")}</th>
                <th className="px-3 py-2 text-start">{t("financialWorkspace.cols.customer")}</th>
                <th className="px-3 py-2 text-start">{t("financialWorkspace.cols.date")}</th>
                <th className="px-3 py-2 text-start">{t("financialWorkspace.cols.dueDate")}</th>
                <th className="px-3 py-2 text-end">{t("financialWorkspace.cols.amount")}</th>
                <th className="px-3 py-2 text-end">{t("financialWorkspace.cols.remaining")}</th>
                <th className="px-3 py-2 text-start">{t("financialWorkspace.cols.status")}</th>
                <th className="px-3 py-2 text-start">{t("financialWorkspace.cols.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => (
                <tr key={inv.id} className="border-t border-border/70 hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <button type="button" className="font-mono text-xs text-primary hover:underline" onClick={() => onSelect(inv)}>
                      {inv.invoiceNumber ?? inv.id.slice(0, 8)}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {inv.customerId ? customerNameById.get(inv.customerId) ?? "—" : "—"}
                  </td>
                  <td className="px-3 py-2">{(inv.issuedAt || inv.createdAt).slice(0, 10)}</td>
                  <td className="px-3 py-2">{inv.dueAt?.slice(0, 10) ?? "—"}</td>
                  <td className="px-3 py-2 text-end font-mono">{money(inv.totalCents)}</td>
                  <td className="px-3 py-2 text-end font-mono">
                    {money(remainingInvoiceCents(inv))}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge tone={invoiceTone(inv.status)}>
                      {t(`financialWorkspace.status.invoice.${inv.status}`, inv.status)}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onSelect(inv)}>
                        {t("financialWorkspace.actions.view")}
                      </Button>
                      {onEdit ? (
                        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onEdit(inv)}>
                          {t("financialWorkspace.actions.edit")}
                        </Button>
                      ) : null}
                      {onPay && remainingInvoiceCents(inv) > 0 ? (
                        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onPay(inv)}>
                          {t("financialWorkspace.actions.pay")}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardCard>
  );
}

function PaymentTable({
  title,
  rows,
  customerNameById,
  invoiceNumberById,
  money,
  t,
  compact,
}: {
  title: string;
  rows: CustomerPayment[];
  customerNameById: Map<string, string>;
  invoiceNumberById: Map<string, string>;
  money: (cents: number) => string;
  t: (key: string, fallback?: string) => string;
  compact?: boolean;
}) {
  return (
    <DashboardCard className="overflow-hidden p-0">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          {t("financialWorkspace.empty.payments")}
        </p>
      ) : (
        <div className={cn("overflow-auto", compact ? "max-h-[320px]" : "max-h-[560px]")}>
          <table className="w-full min-w-[800px] text-sm">
            <thead className="sticky top-0 bg-muted/80 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-3 py-2 text-start">{t("financialWorkspace.cols.payment")}</th>
                <th className="px-3 py-2 text-start">{t("financialWorkspace.cols.customer")}</th>
                <th className="px-3 py-2 text-start">{t("financialWorkspace.cols.invoice")}</th>
                <th className="px-3 py-2 text-end">{t("financialWorkspace.cols.amount")}</th>
                <th className="px-3 py-2 text-start">{t("financialWorkspace.cols.method")}</th>
                <th className="px-3 py-2 text-start">{t("financialWorkspace.cols.status")}</th>
                <th className="px-3 py-2 text-start">{t("financialWorkspace.cols.date")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((pay) => (
                <tr key={pay.id} className="border-t border-border/70">
                  <td className="px-3 py-2 font-mono text-xs">{pay.id.slice(0, 8)}</td>
                  <td className="px-3 py-2">
                    {pay.customerId ? customerNameById.get(pay.customerId) ?? "—" : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {invoiceNumberById.get(pay.invoiceId) ?? pay.invoiceId.slice(0, 8)}
                  </td>
                  <td className="px-3 py-2 text-end font-mono">{money(pay.amountCents)}</td>
                  <td className="px-3 py-2">
                    {t(`financialWorkspace.method.${pay.paymentMethod}`, pay.paymentMethod)}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge tone={paymentTone(pay.status)}>
                      {t(`financialWorkspace.status.payment.${pay.status}`, pay.status)}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-2">{(pay.paidAt || pay.createdAt).slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardCard>
  );
}
