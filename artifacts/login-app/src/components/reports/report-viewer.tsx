import { format } from "date-fns";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Briefcase,
  Building2,
  CalendarDays,
  Coins,
  Cpu,
  DollarSign,
  FileText,
  Gauge,
  Package,
  PieChart,
  Target,
  Ticket,
  Users,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard } from "@/components/dashboard/ui";
import {
  ReportBarSeries,
  ReportDataTable,
  ReportKpiStrip,
  ReportSection,
  ReportStatusBreakdown,
  countByKey,
} from "@/components/reports/report-shared-ui";
import { useCompanyLocaleContext } from "@/context/company-locale-context";
import { useAuth } from "@/context/auth-context";
import { useCustomers } from "@/hooks/use-customers";
import { useBookings } from "@/hooks/use-bookings";
import { useInvoices } from "@/hooks/use-invoices";
import { useCompanies } from "@/hooks/use-companies";
import { useLeadsQueue } from "@/hooks/leads/use-leads-workspace";
import { useOpportunityList } from "@/hooks/opportunities/use-opportunity-commands";
import { useProductCatalog } from "@/hooks/products/use-product-commands";
import { useQuotesList } from "@/hooks/quotes/use-quote-commands";
import {
  useBillingRevenueMetrics,
  usePlatformFinancialListPaged,
} from "@/hooks/billing/use-platform-financial-list";
import {
  useCompanySubscription,
  useCompanySubscriptionsPaged,
} from "@/hooks/billing/use-company-subscriptions";
import { useCompanyUsageSnapshot } from "@/hooks/billing/use-company-entitlements";
import { useAiAnalyticsAggregate, useAiAnalyticsRecords } from "@/hooks/ai-observability/use-ai-analytics";
import { useAiCostAggregate, useAiCostRecords } from "@/hooks/ai-observability/use-ai-costs";
import { useExecutiveDashboard, useExecutiveReport } from "@/lib/executive";
import { computeExecutiveAiUsage } from "@/lib/company-workspace/executive-ai-usage";
import { queryShellStateFromQuery } from "@/lib/react-query/query-shell-state";
import { fetchTicketInboxMetrics } from "@/lib/tickets/fetch-ticket-inbox-metrics";
import { supabase } from "@/lib/supabase";
import type { Booking, Company, Invoice } from "@/lib/types";
import type { ReportDefinition, ReportId } from "@/lib/reports/report-catalog";
import type { OverviewExportInput } from "@/lib/reports/report-export";
import { isDateInRange, type ReportsDateRange } from "@/lib/reports/reports-filters";
import { translateReportLabel } from "@/lib/reports/report-label-i18n";

type LeadRow = {
  id: string;
  name?: string | null;
  status?: string | null;
  source?: string | null;
  created_at?: string | null;
};

type OpportunityRow = {
  id: string;
  name?: string | null;
  stage?: string | null;
  status?: string | null;
  amount?: number | null;
  currency?: string | null;
};

type ProductRow = {
  id: string;
  name?: string | null;
  sku?: string | null;
  productType?: string | null;
  status?: string | null;
  active?: boolean | null;
};

type QuoteRow = {
  id: string;
  number?: string | null;
  status?: string | null;
  total?: number | null;
  currency?: string | null;
  createdAt?: string | null;
};

type TicketMetrics = {
  totalTickets?: number;
  openTickets?: number;
  unassignedTickets?: number;
  highUrgentTickets?: number;
  slaAtRiskOpen?: number;
  ticketsByStatus?: Record<string, number>;
  ticketsByPriority?: Record<string, number>;
};

type RevenueMetrics = {
  mrr: number;
  arr: number;
  active_subscriptions: number;
  trialing_subscriptions: number;
  failed_payments_30d: number;
  failed_payment_rate: number;
};

type SubscriptionRow = {
  id: string;
  company_name?: string | null;
  status?: string | null;
  billing_cycle?: string | null;
  plan_name?: string | null;
  mrr?: number | null;
  renewal_at?: string | null;
};

type AiCostAggregate = {
  totalTokens: number;
  totalCost: number;
  currency: string;
  recordCount: number;
  byProvider: Record<string, { totalTokens: number; totalCost: number; recordCount: number }>;
};

type AiCostRecord = {
  id: string;
  provider_key?: string | null;
  model?: string | null;
  total_tokens?: number | null;
  estimated_cost?: number | null;
  recorded_at?: string | null;
  billing_period?: string | null;
};

type CompanyAiConsumptionRow = {
  id: string;
  companyName: string;
  status: string;
  aiTokensUsed: number;
  aiTokenLimit: number | null;
  usagePct: number | null;
  storageMb: number;
  apiCalls: number;
  planName: string | null;
};

export type ReportViewerModel = {
  overview: OverviewExportInput;
  bookings: Booking[];
  customers: ReturnType<typeof useCustomers>["data"];
  invoices: Invoice[];
  leads: LeadRow[];
  opportunities: OpportunityRow[];
  products: ProductRow[];
  quotes: QuoteRow[];
  companies: Company[];
  subscriptions: SubscriptionRow[];
  ticketMetrics: TicketMetrics | null;
  revenueMetrics: RevenueMetrics | null;
  platformPayments: Array<{ id: string; label: string; amount: number; status: string; date: string }>;
  executiveReport: ReturnType<typeof useExecutiveReport>["data"] | null | undefined;
  executiveDashboard: ReturnType<typeof useExecutiveDashboard>["data"] | null | undefined;
  executiveLoading: boolean;
  aiCostAggregate: AiCostAggregate | null;
  aiCostRecords: AiCostRecord[];
  aiAnalytics: {
    totalExecutions?: number;
    averageLatencyMs?: number | null;
    timeoutCount?: number;
    totalTokens?: number;
    totalEstimatedCost?: number;
    currency?: string;
    byStatus?: Record<string, number>;
    byProvider?: Record<string, { executions: number; totalTokens: number; totalCost: number }>;
  } | null;
  aiUsageMetrics: ReturnType<typeof computeExecutiveAiUsage> | null;
  companyAiConsumption: CompanyAiConsumptionRow[];
  companyUsageMetrics: {
    aiTokens: number;
    storageMb: number;
    apiCalls: number;
  } | null;
  loading: boolean;
  backgroundRefresh: boolean;
};

function asItems<T>(data: unknown): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (typeof data === "object" && data !== null && "items" in data) {
    const items = (data as { items?: unknown }).items;
    return Array.isArray(items) ? (items as T[]) : [];
  }
  if (typeof data === "object" && data !== null && "rows" in data) {
    const rows = (data as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }
  return [];
}

function monthSeries(bookings: Booking[]) {
  const months: string[] = [];
  const counts: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(format(d, "MMM"));
    counts.push(
      bookings.filter((booking) => {
        const bd = new Date(booking.booking_date);
        return bd.getMonth() === d.getMonth() && bd.getFullYear() === d.getFullYear();
      }).length,
    );
  }
  return { months, counts };
}

export function useReportViewerData(
  reportId: ReportId | null,
  branchFilter: string | null,
  options?: { loadLeads?: boolean; dateRange?: ReportsDateRange | null },
): ReportViewerModel {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const dateRange = options?.dateRange ?? { from: null, to: null };

  const customersQuery = useCustomers();
  const bookingsQuery = useBookings();
  const invoicesQuery = useInvoices();

  const leadsEnabled = Boolean(options?.loadLeads) || reportId === "leads";
  const leadsQuery = useLeadsQueue(leadsEnabled ? { limit: 500 } : undefined);

  const oppsEnabled = reportId === "opportunities";
  const opportunitiesQuery = useOpportunityList({ limit: oppsEnabled ? 200 : 1 });

  const productsEnabled = reportId === "products";
  const productsQuery = useProductCatalog(productsEnabled ? { activeOnly: false } : undefined);

  const quotesEnabled = reportId === "quotes";
  const quotesQuery = useQuotesList(quotesEnabled ? {} : undefined);

  const companiesEnabled = reportId === "companies" || reportId === "company_revenue";
  const companiesQuery = useCompanies(companiesEnabled);

  const revenueEnabled = reportId === "company_revenue" || reportId === "subscriptions" || reportId === "financial";
  const revenueQuery = useBillingRevenueMetrics(revenueEnabled);

  const subscriptionsEnabled = reportId === "subscriptions" || reportId === "company_revenue";
  const subscriptionsQuery = useCompanySubscriptionsPaged({
    enabled: subscriptionsEnabled,
    limit: 100,
    offset: 0,
  });

  const paymentsEnabled = reportId === "company_revenue" || reportId === "financial";
  const paymentsQuery = usePlatformFinancialListPaged("payments", {
    enabled: paymentsEnabled,
    limit: 50,
    offset: 0,
  });

  const ticketsEnabled = reportId === "tickets";
  const ticketsQuery = useQuery({
    queryKey: ["reports", "ticket-metrics", companyId],
    enabled: Boolean(ticketsEnabled && companyId),
    queryFn: async () => {
      if (!companyId) return null;
      return fetchTicketInboxMetrics(companyId);
    },
  });

  const aiEnabled = reportId === "ai_consumption";
  const aiCostQuery = useAiCostAggregate(undefined, aiEnabled);
  const aiCostRecordsQuery = useAiCostRecords(40, aiEnabled);
  const aiAnalyticsQuery = useAiAnalyticsAggregate(200, aiEnabled);
  const aiAnalyticsRecordsQuery = useAiAnalyticsRecords(40, aiEnabled);
  const companySubscriptionQuery = useCompanySubscription(companyId, aiEnabled);
  const companyUsageQuery = useCompanyUsageSnapshot(companyId, aiEnabled);

  const platformAiConsumptionEnabled = reportId === "ai_consumption";
  const platformAiQuery = useQuery({
    queryKey: ["reports", "company-ai-consumption"],
    enabled: platformAiConsumptionEnabled,
    queryFn: async (): Promise<CompanyAiConsumptionRow[]> => {
      const [{ data: subs, error: subsError }, { data: snaps, error: snapsError }] =
        await Promise.all([
          supabase
            .from("company_subscriptions")
            .select(
              `
              id,
              company_id,
              status,
              company:companies(id, name, status),
              plan:plans(name, display_name, ai_tokens_monthly)
            `,
            )
            .limit(300),
          supabase
            .from("company_usage_snapshots")
            .select("company_id, snapshot_date, metrics")
            .order("snapshot_date", { ascending: false })
            .limit(800),
        ]);
      if (subsError) throw new Error(subsError.message);
      if (snapsError) throw new Error(snapsError.message);

      const latestByCompany = new Map<string, Record<string, number>>();
      for (const snap of snaps ?? []) {
        const companyKey = String(snap.company_id);
        if (latestByCompany.has(companyKey)) continue;
        latestByCompany.set(companyKey, (snap.metrics as Record<string, number>) ?? {});
      }

      return (subs ?? []).map((row) => {
        const company = Array.isArray(row.company) ? row.company[0] : row.company;
        const plan = Array.isArray(row.plan) ? row.plan[0] : row.plan;
        const metrics = latestByCompany.get(String(row.company_id)) ?? {};
        const used = Number(metrics.ai_tokens ?? 0);
        const limit =
          plan?.ai_tokens_monthly != null && Number(plan.ai_tokens_monthly) > 0
            ? Number(plan.ai_tokens_monthly)
            : null;
        return {
          id: String(row.id ?? row.company_id),
          companyName: company?.name ?? String(row.company_id).slice(0, 8),
          status: String(company?.status ?? row.status ?? "—"),
          aiTokensUsed: used,
          aiTokenLimit: limit,
          usagePct: limit != null ? Math.round((used / limit) * 1000) / 10 : null,
          storageMb: Math.round(Number(metrics.storage_bytes ?? 0) / (1024 * 1024)),
          apiCalls: Number(metrics.api_calls ?? 0),
          planName: plan?.display_name ?? plan?.name ?? null,
        };
      });
    },
  });

  const allBookings = bookingsQuery.data ?? [];
  const bookings = useMemo(() => {
    return allBookings.filter((b) => {
      if (branchFilter && b.location_id !== branchFilter) return false;
      if (!isDateInRange(b.booking_date, dateRange)) return false;
      return true;
    });
  }, [allBookings, branchFilter, dateRange]);

  const customers = useMemo(() => {
    const rows = customersQuery.data ?? [];
    return rows.filter((c) => isDateInRange(c.created_at, dateRange));
  }, [customersQuery.data, dateRange]);

  const invoices = useMemo(() => {
    const rows = invoicesQuery.data ?? [];
    return rows.filter((inv) => isDateInRange(inv.invoice_date || inv.created_at, dateRange));
  }, [dateRange, invoicesQuery.data]);

  const companies = useMemo(() => {
    const rows = companiesQuery.data ?? [];
    return rows.filter((c) => isDateInRange(c.created_at, dateRange));
  }, [companiesQuery.data, dateRange]);

  const totalRevenue = invoices
    .filter((invoice) => invoice.status === "Paid")
    .reduce((sum, invoice) => sum + Number(invoice.amount), 0);

  const executiveEnabled = reportId === "executive" && Boolean(companyId);
  const executiveContext = executiveEnabled
    ? {
        companyId: companyId!,
        branchId: branchFilter,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        date: dateRange.to ?? new Date().toISOString().slice(0, 10),
      }
    : null;
  const executiveQuery = useExecutiveReport(
    executiveContext,
    executiveEnabled
      ? {
          companyId: companyId!,
          kind: "monthly",
          period: "monthly",
          branchId: branchFilter,
        }
      : null,
  );
  const executiveDashboardQuery = useExecutiveDashboard(executiveContext);

  const leads = useMemo(() => {
    const rows = leadsQuery.data?.rows ?? [];
    return rows
      .map((row) => ({
        id: row.id,
        name: row.name ?? null,
        status: row.lifecycleStatus ?? null,
        source: row.source ?? null,
        created_at: row.createdAt ?? null,
      }))
      .filter((row) => isDateInRange(row.created_at, dateRange));
  }, [dateRange, leadsQuery.data]);

  const opportunities = useMemo(() => {
    return asItems<Record<string, unknown>>(opportunitiesQuery.data).map((row) => ({
      id: String(row.id ?? crypto.randomUUID()),
      name: (row.name as string | null | undefined) ?? (row.title as string | null | undefined) ?? null,
      stage: (row.stage as string | null | undefined) ?? (row.stageName as string | null | undefined) ?? null,
      status: (row.status as string | null | undefined) ?? null,
      amount:
        typeof row.amount === "number"
          ? row.amount
          : typeof row.value === "number"
            ? row.value
            : Number(row.amount ?? row.value ?? 0) || null,
      currency: (row.currency as string | null | undefined) ?? null,
    }));
  }, [opportunitiesQuery.data]);

  const products = useMemo(() => {
    return asItems<Record<string, unknown>>(productsQuery.data).map((row) => ({
      id: String(row.id ?? crypto.randomUUID()),
      name: (row.name as string | null | undefined) ?? null,
      sku: (row.sku as string | null | undefined) ?? null,
      productType:
        (row.productType as string | null | undefined) ??
        (row.product_type as string | null | undefined) ??
        null,
      status: (row.status as string | null | undefined) ?? null,
      active: typeof row.active === "boolean" ? row.active : null,
    }));
  }, [productsQuery.data]);

  const quotes = useMemo(() => {
    return asItems<Record<string, unknown>>(quotesQuery.data).map((row) => ({
      id: String(row.id ?? crypto.randomUUID()),
      number:
        (row.number as string | null | undefined) ??
        (row.quoteNumber as string | null | undefined) ??
        null,
      status: (row.status as string | null | undefined) ?? null,
      total:
        typeof row.total === "number"
          ? row.total
          : typeof row.grandTotal === "number"
            ? row.grandTotal
            : Number(row.total ?? row.grandTotal ?? 0) || null,
      currency: (row.currency as string | null | undefined) ?? null,
      createdAt:
        (row.createdAt as string | null | undefined) ??
        (row.created_at as string | null | undefined) ??
        null,
    }));
  }, [quotesQuery.data]);

  const subscriptions = useMemo(() => {
    const rows = subscriptionsQuery.data?.rows ?? [];
    return rows.map((row) => ({
      id: row.id,
      company_name: row.company?.name ?? null,
      status: row.status ?? null,
      billing_cycle: row.billing_cycle ?? null,
      plan_name: row.plan?.display_name ?? row.plan?.name ?? null,
      mrr: null,
      renewal_at: row.next_renewal_at ?? row.current_period_end ?? null,
    }));
  }, [subscriptionsQuery.data]);

  const platformPayments = useMemo(() => {
    const rows = paymentsQuery.data?.rows ?? [];
    return rows.map((row, index) => ({
      id: String(row.id ?? `pay-${index}`),
      label: String(row.company_name ?? row.companyName ?? row.reference ?? row.id ?? "Payment"),
      amount: Number(row.amount ?? row.total ?? 0),
      status: String(row.status ?? "unknown"),
      date: String(row.paid_at ?? row.created_at ?? row.createdAt ?? ""),
    }));
  }, [paymentsQuery.data]);

  const aiUsageMetrics = useMemo(() => {
    if (!aiEnabled) return null;
    return computeExecutiveAiUsage({
      aggregate: (aiCostQuery.data as AiCostAggregate | null) ?? null,
      records: (aiCostRecordsQuery.data as AiCostRecord[] | undefined) ?? [],
      analytics: aiAnalyticsQuery.data ?? null,
      analyticsRecords: aiAnalyticsRecordsQuery.data ?? [],
      monthlyQuota: companySubscriptionQuery.data?.plan?.ai_tokens_monthly ?? null,
    });
  }, [
    aiAnalyticsQuery.data,
    aiAnalyticsRecordsQuery.data,
    aiCostQuery.data,
    aiCostRecordsQuery.data,
    aiEnabled,
    companySubscriptionQuery.data?.plan?.ai_tokens_monthly,
  ]);

  const loading =
    reportId === "ai_consumption"
      ? aiCostQuery.isLoading ||
        aiCostRecordsQuery.isLoading ||
        aiAnalyticsQuery.isLoading ||
        platformAiQuery.isLoading
      : reportId === "executive"
        ? false
        : queryShellStateFromQuery(customersQuery).isInitialLoad ||
          queryShellStateFromQuery(bookingsQuery).isInitialLoad ||
          queryShellStateFromQuery(invoicesQuery).isInitialLoad ||
          (leadsEnabled && leadsQuery.isLoading) ||
          (oppsEnabled && opportunitiesQuery.isLoading) ||
          (productsEnabled && productsQuery.isLoading) ||
          (quotesEnabled && quotesQuery.isLoading) ||
          (companiesEnabled && companiesQuery.isLoading) ||
          (revenueEnabled && revenueQuery.isLoading) ||
          (subscriptionsEnabled && subscriptionsQuery.isLoading) ||
          (paymentsEnabled && paymentsQuery.isLoading) ||
          (ticketsEnabled && ticketsQuery.isLoading);

  const executiveLoading =
    reportId === "executive" &&
    (executiveQuery.isLoading || executiveDashboardQuery.isLoading);

  const backgroundRefresh =
    queryShellStateFromQuery(customersQuery).isBackgroundRefresh ||
    queryShellStateFromQuery(bookingsQuery).isBackgroundRefresh ||
    queryShellStateFromQuery(invoicesQuery).isBackgroundRefresh;

  return {
    overview: {
      revenue: totalRevenue,
      customers: customers.length,
      bookings: bookings.length,
      invoices: invoices.length,
      branchLabel: branchFilter ?? "all",
    },
    bookings,
    customers,
    invoices,
    leads,
    opportunities,
    products,
    quotes,
    companies,
    subscriptions,
    ticketMetrics: (ticketsQuery.data as TicketMetrics | null) ?? null,
    revenueMetrics: (revenueQuery.data as RevenueMetrics | null) ?? null,
    platformPayments,
    executiveReport: executiveQuery.data ?? undefined,
    executiveDashboard: executiveDashboardQuery.data ?? undefined,
    executiveLoading,
    aiCostAggregate: (aiCostQuery.data as AiCostAggregate | null) ?? null,
    aiCostRecords: (aiCostRecordsQuery.data as AiCostRecord[] | undefined) ?? [],
    aiAnalytics: aiAnalyticsQuery.data ?? null,
    aiUsageMetrics,
    companyAiConsumption: platformAiQuery.data ?? [],
    companyUsageMetrics: companyUsageQuery.data
      ? {
          aiTokens: Number(companyUsageQuery.data.metrics?.ai_tokens ?? 0),
          storageMb: Math.round(
            Number(companyUsageQuery.data.metrics?.storage_bytes ?? 0) / (1024 * 1024),
          ),
          apiCalls: Number(companyUsageQuery.data.metrics?.api_calls ?? 0),
        }
      : null,
    loading,
    backgroundRefresh,
  };
}

export function ReportViewer({
  report,
  model,
}: {
  report: ReportDefinition;
  model: ReportViewerModel;
}) {
  const { t } = useTranslation("common");
  const { formatCurrency } = useCompanyLocaleContext();
  const empty = t("dashboard.reports.center.emptyPeriod");
  const { months, counts } = monthSeries(model.bookings);

  const invoices = model.invoices;
  const bookings = model.bookings;
  const totalBilled = invoices.reduce((sum, inv) => sum + Number(inv.amount), 0);
  const paid = invoices
    .filter((inv) => inv.status === "Paid")
    .reduce((sum, inv) => sum + Number(inv.amount), 0);
  const unpaid = invoices
    .filter((inv) => inv.status === "Unpaid")
    .reduce((sum, inv) => sum + Number(inv.amount), 0);
  const overdue = invoices
    .filter((inv) => inv.status === "Overdue")
    .reduce((sum, inv) => sum + Number(inv.amount), 0);

  if (report.id === "overview") {
    return (
      <ReportSection>
        <ReportKpiStrip
          loading={model.loading}
          items={[
            {
              id: "revenue",
              label: t("dashboard.reports.stats.revenue"),
              value: formatCurrency(model.overview.revenue),
              icon: DollarSign,
            },
            {
              id: "customers",
              label: t("dashboard.reports.stats.customers"),
              value: model.overview.customers,
              icon: Users,
            },
            {
              id: "bookings",
              label: t("dashboard.reports.stats.bookings"),
              value: model.overview.bookings,
              icon: CalendarDays,
            },
            {
              id: "invoices",
              label: t("dashboard.reports.stats.invoices"),
              value: model.overview.invoices,
              icon: FileText,
            },
          ]}
        />
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <ReportBarSeries
              title={t("dashboard.reports.bookingsPerMonth")}
              labels={months}
              values={counts}
              emptyLabel={empty}
            />
          </div>
          <div className="lg:col-span-2">
            <ReportStatusBreakdown
              title={t("dashboard.reports.invoiceBreakdown")}
              emptyLabel={t("dashboard.reports.noInvoices")}
              slices={[
                { id: "paid", label: t("status.paid"), value: paid, color: "bg-emerald-500" },
                { id: "unpaid", label: t("status.unpaid"), value: unpaid, color: "bg-amber-500" },
                { id: "overdue", label: t("status.overdue"), value: overdue, color: "bg-rose-500" },
              ]}
            />
          </div>
        </div>
      </ReportSection>
    );
  }

  if (report.id === "bookings") {
    return (
      <ReportSection>
        <ReportKpiStrip
          loading={model.loading}
          items={[
            {
              id: "total",
              label: t("dashboard.reports.stats.bookings"),
              value: bookings.length,
              icon: CalendarDays,
            },
            {
              id: "confirmed",
              label: t("dashboard.reports.catalog.confirmed", "Confirmed"),
              value: bookings.filter((b) => b.status === "Confirmed").length,
              icon: BarChart3,
            },
            {
              id: "pending",
              label: t("dashboard.reports.catalog.pending", "Pending"),
              value: bookings.filter((b) => b.status === "Pending").length,
              icon: Activity,
            },
            {
              id: "cancelled",
              label: t("dashboard.reports.catalog.cancelled", "Cancelled"),
              value: bookings.filter((b) => b.status === "Cancelled").length,
              icon: FileText,
            },
          ]}
        />
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <ReportBarSeries
              title={t("dashboard.reports.bookingsPerMonth")}
              labels={months}
              values={counts}
              emptyLabel={empty}
            />
          </div>
          <div className="lg:col-span-2">
            <ReportStatusBreakdown
              title={t("dashboard.reports.center.bookingStatus")}
              emptyLabel={empty}
              slices={countByKey(bookings, (b) => b.status)}
            />
          </div>
        </div>
        <ReportDataTable
          title={t("dashboard.reports.detail.recentBookings", "Recent bookings")}
          emptyLabel={empty}
          rows={[...bookings]
            .sort((a, b) => String(b.booking_date).localeCompare(String(a.booking_date)))
            .slice(0, 50)}
          columns={[
            {
              id: "date",
              header: t("dashboard.reports.center.colDate"),
              cell: (row) => row.booking_date?.slice(0, 10) ?? "—",
            },
            {
              id: "service",
              header: t("dashboard.reports.center.colService"),
              cell: (row) => row.service || "—",
            },
            {
              id: "customer",
              header: t("dashboard.reports.detail.customer", "Customer"),
              cell: (row) => row.customers?.name ?? row.customer_id?.slice(0, 8) ?? "—",
            },
            {
              id: "status",
              header: t("dashboard.reports.center.colStatus"),
              cell: (row) => row.status,
            },
          ]}
        />
      </ReportSection>
    );
  }

  if (report.id === "customers") {
    const rows = model.customers ?? [];
    const withEmail = rows.filter((c) => Boolean(c.email)).length;
    const withPhone = rows.filter((c) => Boolean(c.phone)).length;
    return (
      <ReportSection>
        <ReportKpiStrip
          loading={model.loading}
          items={[
            {
              id: "total",
              label: t("dashboard.reports.stats.customers"),
              value: rows.length,
              icon: Users,
            },
            {
              id: "email",
              label: t("dashboard.reports.detail.withEmail", "With email"),
              value: withEmail,
              icon: FileText,
            },
            {
              id: "phone",
              label: t("dashboard.reports.detail.withPhone", "With phone"),
              value: withPhone,
              icon: Activity,
            },
          ]}
        />
        <ReportDataTable
          title={t("dashboard.reports.detail.customerList", "Customers in period")}
          emptyLabel={empty}
          rows={[...rows]
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
            .slice(0, 75)}
          columns={[
            {
              id: "name",
              header: t("dashboard.reports.detail.name", "Name"),
              cell: (row) => row.name || "—",
            },
            {
              id: "phone",
              header: t("dashboard.reports.detail.phone", "Phone"),
              cell: (row) => row.phone || "—",
            },
            {
              id: "email",
              header: t("dashboard.reports.detail.email", "Email"),
              cell: (row) => row.email || "—",
            },
            {
              id: "created",
              header: t("dashboard.reports.center.colDate"),
              cell: (row) => row.created_at?.slice(0, 10) ?? "—",
            },
          ]}
        />
      </ReportSection>
    );
  }

  if (report.id === "leads") {
    return (
      <ReportSection>
        <ReportKpiStrip
          loading={model.loading}
          items={[
            {
              id: "total",
              label: t("dashboard.reports.catalog.leads"),
              value: model.leads.length,
              icon: Target,
            },
            {
              id: "sources",
              label: t("dashboard.reports.detail.sources", "Sources"),
              value: new Set(model.leads.map((l) => l.source).filter(Boolean)).size,
              icon: PieChart,
            },
          ]}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <ReportStatusBreakdown
            title={t("dashboard.reports.detail.byStatus", "By status")}
            emptyLabel={empty}
            slices={countByKey(model.leads, (l) => l.status)}
          />
          <ReportStatusBreakdown
            title={t("dashboard.reports.detail.bySource", "By source")}
            emptyLabel={empty}
            slices={countByKey(model.leads, (l) => l.source)}
          />
        </div>
        <ReportDataTable
          title={t("dashboard.reports.detail.leadList", "Leads in period")}
          emptyLabel={empty}
          rows={[...model.leads]
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
            .slice(0, 75)}
          columns={[
            {
              id: "name",
              header: t("dashboard.reports.detail.name", "Name"),
              cell: (row) => row.name || "—",
            },
            {
              id: "status",
              header: t("dashboard.reports.center.colStatus"),
              cell: (row) => row.status || "—",
            },
            {
              id: "source",
              header: t("dashboard.reports.detail.source", "Source"),
              cell: (row) => row.source || "—",
            },
            {
              id: "created",
              header: t("dashboard.reports.center.colDate"),
              cell: (row) => row.created_at?.slice(0, 10) ?? "—",
            },
          ]}
        />
      </ReportSection>
    );
  }

  if (report.id === "opportunities") {
    const pipelineValue = model.opportunities.reduce((sum, o) => sum + Number(o.amount ?? 0), 0);
    return (
      <ReportSection>
        <ReportKpiStrip
          loading={model.loading}
          items={[
            {
              id: "total",
              label: t("dashboard.reports.catalog.opportunities"),
              value: model.opportunities.length,
              icon: Target,
            },
            {
              id: "value",
              label: t("dashboard.reports.detail.pipelineValue", "Pipeline value"),
              value: formatCurrency(pipelineValue),
              icon: DollarSign,
            },
          ]}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <ReportStatusBreakdown
            title={t("dashboard.reports.detail.byStage", "By stage")}
            emptyLabel={empty}
            slices={countByKey(model.opportunities, (o) => o.stage || o.status)}
          />
          <ReportStatusBreakdown
            title={t("dashboard.reports.detail.byStatus", "By status")}
            emptyLabel={empty}
            slices={countByKey(model.opportunities, (o) => o.status)}
          />
        </div>
        <ReportDataTable
          title={t("dashboard.reports.detail.opportunityList", "Opportunities")}
          emptyLabel={empty}
          rows={model.opportunities.slice(0, 75)}
          columns={[
            {
              id: "name",
              header: t("dashboard.reports.detail.name", "Name"),
              cell: (row) => row.name || "—",
            },
            {
              id: "stage",
              header: t("dashboard.reports.detail.stage", "Stage"),
              cell: (row) => row.stage || "—",
            },
            {
              id: "status",
              header: t("dashboard.reports.center.colStatus"),
              cell: (row) => row.status || "—",
            },
            {
              id: "amount",
              header: t("dashboard.reports.center.colAmount"),
              cell: (row) => formatCurrency(Number(row.amount ?? 0)),
            },
          ]}
        />
      </ReportSection>
    );
  }

  if (report.id === "products") {
    const active = model.products.filter((p) => p.active !== false).length;
    return (
      <ReportSection>
        <ReportKpiStrip
          loading={model.loading}
          items={[
            {
              id: "total",
              label: t("dashboard.reports.catalog.products"),
              value: model.products.length,
              icon: Package,
            },
            {
              id: "active",
              label: t("dashboard.reports.detail.active", "Active"),
              value: active,
              icon: Activity,
            },
          ]}
        />
        <ReportStatusBreakdown
          title={t("dashboard.reports.detail.byType", "By type")}
          emptyLabel={empty}
          slices={countByKey(model.products, (p) => p.productType || p.status)}
        />
        <ReportDataTable
          title={t("dashboard.reports.detail.productList", "Product catalog")}
          emptyLabel={empty}
          rows={model.products.slice(0, 100)}
          columns={[
            {
              id: "name",
              header: t("dashboard.reports.detail.name", "Name"),
              cell: (row) => row.name || "—",
            },
            {
              id: "sku",
              header: t("dashboard.reports.detail.sku", "SKU"),
              cell: (row) => row.sku || "—",
            },
            {
              id: "type",
              header: t("dashboard.reports.detail.type", "Type"),
              cell: (row) => row.productType || "—",
            },
            {
              id: "status",
              header: t("dashboard.reports.center.colStatus"),
              cell: (row) =>
                row.status ||
                (row.active === false
                  ? t("dashboard.reports.detail.inactive", "Inactive")
                  : t("dashboard.reports.detail.active", "Active")),
            },
          ]}
        />
      </ReportSection>
    );
  }

  if (report.id === "quotes") {
    const quoteTotal = model.quotes.reduce((sum, q) => sum + Number(q.total ?? 0), 0);
    return (
      <ReportSection>
        <ReportKpiStrip
          loading={model.loading}
          items={[
            {
              id: "total",
              label: t("dashboard.reports.catalog.quotes"),
              value: model.quotes.length,
              icon: FileText,
            },
            {
              id: "value",
              label: t("dashboard.reports.detail.quoteValue", "Quoted value"),
              value: formatCurrency(quoteTotal),
              icon: DollarSign,
            },
          ]}
        />
        <ReportStatusBreakdown
          title={t("dashboard.reports.detail.byStatus", "By status")}
          emptyLabel={empty}
          slices={countByKey(model.quotes, (q) => q.status)}
        />
        <ReportDataTable
          title={t("dashboard.reports.detail.quoteList", "Quotes")}
          emptyLabel={empty}
          rows={model.quotes.slice(0, 75)}
          columns={[
            {
              id: "number",
              header: t("dashboard.reports.center.colId"),
              cell: (row) => row.number || row.id.slice(0, 8),
            },
            {
              id: "status",
              header: t("dashboard.reports.center.colStatus"),
              cell: (row) => row.status || "—",
            },
            {
              id: "total",
              header: t("dashboard.reports.center.colAmount"),
              cell: (row) => formatCurrency(Number(row.total ?? 0)),
            },
            {
              id: "date",
              header: t("dashboard.reports.center.colDate"),
              cell: (row) => row.createdAt?.slice(0, 10) ?? "—",
            },
          ]}
        />
      </ReportSection>
    );
  }

  if (report.id === "tickets") {
    const m = model.ticketMetrics;
    const byStatus = Object.entries(m?.ticketsByStatus ?? {}).map(([id, value]) => ({
      id,
      label: id,
      value: Number(value || 0),
    }));
    const byPriority = Object.entries(m?.ticketsByPriority ?? {}).map(([id, value]) => ({
      id,
      label: id,
      value: Number(value || 0),
    }));
    return (
      <ReportSection>
        <ReportKpiStrip
          loading={model.loading}
          items={[
            {
              id: "total",
              label: t("dashboard.reports.catalog.tickets"),
              value: m?.totalTickets ?? 0,
              icon: Ticket,
            },
            {
              id: "open",
              label: t("dashboard.reports.detail.openTickets", "Open"),
              value: m?.openTickets ?? 0,
              icon: Activity,
            },
            {
              id: "unassigned",
              label: t("dashboard.reports.detail.unassigned", "Unassigned"),
              value: m?.unassignedTickets ?? 0,
              icon: Users,
            },
            {
              id: "sla",
              label: t("dashboard.reports.detail.slaAtRisk", "SLA at risk"),
              value: m?.slaAtRiskOpen ?? 0,
              icon: BarChart3,
            },
          ]}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <ReportStatusBreakdown
            title={t("dashboard.reports.detail.byStatus", "By status")}
            emptyLabel={empty}
            slices={byStatus}
          />
          <ReportStatusBreakdown
            title={t("dashboard.reports.detail.byPriority", "By priority")}
            emptyLabel={empty}
            slices={byPriority}
          />
        </div>
      </ReportSection>
    );
  }

  if (report.id === "operations") {
    const today = new Date().toISOString().slice(0, 10);
    const todayBookings = bookings.filter((b) => b.booking_date?.slice(0, 10) === today);
    return (
      <ReportSection>
        <ReportKpiStrip
          loading={model.loading}
          items={[
            {
              id: "period",
              label: t("dashboard.reports.detail.opsInPeriod", "Operations in period"),
              value: bookings.length,
              icon: Briefcase,
            },
            {
              id: "today",
              label: t("dashboard.reports.detail.opsToday", "Today"),
              value: todayBookings.length,
              icon: CalendarDays,
            },
            {
              id: "confirmed",
              label: t("dashboard.reports.catalog.confirmed", "Confirmed"),
              value: bookings.filter((b) => b.status === "Confirmed").length,
              icon: Activity,
            },
          ]}
        />
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <ReportBarSeries
              title={t("dashboard.reports.bookingsPerMonth")}
              labels={months}
              values={counts}
              emptyLabel={empty}
            />
          </div>
          <div className="lg:col-span-2">
            <ReportStatusBreakdown
              title={t("dashboard.reports.center.bookingStatus")}
              emptyLabel={empty}
              slices={countByKey(bookings, (b) => b.status)}
            />
          </div>
        </div>
        <ReportDataTable
          title={t("dashboard.reports.detail.opsQueue", "Operations queue snapshot")}
          emptyLabel={empty}
          rows={[...bookings]
            .sort((a, b) => String(a.booking_date).localeCompare(String(b.booking_date)))
            .slice(0, 50)}
          columns={[
            {
              id: "date",
              header: t("dashboard.reports.center.colDate"),
              cell: (row) => row.booking_date?.slice(0, 16).replace("T", " ") ?? "—",
            },
            {
              id: "service",
              header: t("dashboard.reports.center.colService"),
              cell: (row) => row.service || "—",
            },
            {
              id: "customer",
              header: t("dashboard.reports.detail.customer", "Customer"),
              cell: (row) => row.customers?.name ?? "—",
            },
            {
              id: "status",
              header: t("dashboard.reports.center.colStatus"),
              cell: (row) => row.status,
            },
          ]}
        />
      </ReportSection>
    );
  }

  if (report.id === "invoices" || report.id === "financial") {
    const collectionRate =
      totalBilled > 0 ? `${Math.round((paid / totalBilled) * 100)}%` : "—";
    return (
      <ReportSection>
        <ReportKpiStrip
          loading={model.loading}
          items={[
            {
              id: "count",
              label: t("dashboard.reports.stats.invoices"),
              value: invoices.length,
              icon: FileText,
            },
            {
              id: "paid",
              label: t("status.paid"),
              value: formatCurrency(paid),
              icon: DollarSign,
            },
            {
              id: "unpaid",
              label: t("status.unpaid"),
              value: formatCurrency(unpaid),
              icon: Coins,
            },
            {
              id: "overdue",
              label: t("status.overdue"),
              value: formatCurrency(overdue),
              icon: Activity,
              trend: collectionRate !== "—" ? `${t("dashboard.reports.center.kpis.collectionRate")}: ${collectionRate}` : undefined,
            },
          ]}
        />
        {report.id === "financial" && model.revenueMetrics ? (
          <ReportKpiStrip
            loading={model.loading}
            items={[
              {
                id: "mrr",
                label: t("dashboard.reports.detail.mrr", "MRR"),
                value: formatCurrency(model.revenueMetrics.mrr),
                icon: DollarSign,
              },
              {
                id: "arr",
                label: t("dashboard.reports.detail.arr", "ARR"),
                value: formatCurrency(model.revenueMetrics.arr),
                icon: BarChart3,
              },
              {
                id: "activeSubs",
                label: t("dashboard.reports.detail.activeSubs", "Active subscriptions"),
                value: model.revenueMetrics.active_subscriptions,
                icon: Building2,
              },
            ]}
          />
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <ReportStatusBreakdown
            title={t("dashboard.reports.invoiceBreakdown")}
            emptyLabel={t("dashboard.reports.noInvoices")}
            slices={[
              { id: "paid", label: t("status.paid"), value: paid, color: "bg-emerald-500" },
              { id: "unpaid", label: t("status.unpaid"), value: unpaid, color: "bg-amber-500" },
              { id: "overdue", label: t("status.overdue"), value: overdue, color: "bg-rose-500" },
            ]}
          />
          <ReportStatusBreakdown
            title={t("dashboard.reports.detail.invoiceCountByStatus", "Invoice count by status")}
            emptyLabel={empty}
            slices={countByKey(invoices, (inv) => inv.status)}
          />
        </div>
        <ReportDataTable
          title={t("dashboard.reports.center.recentInvoices")}
          emptyLabel={empty}
          rows={[...invoices]
            .sort((a, b) =>
              String(b.invoice_date || b.created_at).localeCompare(
                String(a.invoice_date || a.created_at),
              ),
            )
            .slice(0, 75)}
          columns={[
            {
              id: "id",
              header: t("dashboard.reports.center.colId"),
              cell: (row) => row.id.slice(0, 8),
            },
            {
              id: "amount",
              header: t("dashboard.reports.center.colAmount"),
              cell: (row) => formatCurrency(Number(row.amount ?? 0)),
            },
            {
              id: "status",
              header: t("dashboard.reports.center.colStatus"),
              cell: (row) => row.status,
            },
            {
              id: "date",
              header: t("dashboard.reports.center.colDate"),
              cell: (row) => (row.invoice_date || row.created_at || "").slice(0, 10) || "—",
            },
          ]}
        />
        {report.id === "financial" && model.platformPayments.length > 0 ? (
          <ReportDataTable
            title={t("dashboard.reports.detail.platformPayments", "Recent platform payments")}
            emptyLabel={empty}
            rows={model.platformPayments.slice(0, 40)}
            columns={[
              {
                id: "label",
                header: t("dashboard.reports.detail.company", "Company"),
                cell: (row) => row.label,
              },
              {
                id: "amount",
                header: t("dashboard.reports.center.colAmount"),
                cell: (row) => formatCurrency(row.amount),
              },
              {
                id: "status",
                header: t("dashboard.reports.center.colStatus"),
                cell: (row) => row.status,
              },
              {
                id: "date",
                header: t("dashboard.reports.center.colDate"),
                cell: (row) => row.date.slice(0, 10) || "—",
              },
            ]}
          />
        ) : null}
      </ReportSection>
    );
  }

  if (report.id === "companies") {
    return (
      <ReportSection>
        <ReportKpiStrip
          loading={model.loading}
          items={[
            {
              id: "total",
              label: t("dashboard.reports.catalog.companies"),
              value: model.companies.length,
              icon: Building2,
            },
            {
              id: "active",
              label: t("dashboard.reports.detail.active", "Active"),
              value: model.companies.filter((c) => c.status === "Active").length,
              icon: Activity,
            },
            {
              id: "trial",
              label: t("dashboard.reports.detail.trialing", "Trialing"),
              value: model.companies.filter((c) =>
                String(c.subscription_status).toLowerCase().includes("trial"),
              ).length,
              icon: Coins,
            },
          ]}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <ReportStatusBreakdown
            title={t("dashboard.reports.detail.byCompanyStatus", "By company status")}
            emptyLabel={empty}
            slices={countByKey(model.companies, (c) => c.status).map((s) => ({
              ...s,
              label: translateReportLabel(t, s.label),
            }))}
          />
          <ReportStatusBreakdown
            title={t("dashboard.reports.detail.bySubscription", "By subscription")}
            emptyLabel={empty}
            slices={countByKey(model.companies, (c) => c.subscription_status).map((s) => ({
              ...s,
              label: translateReportLabel(t, s.label),
            }))}
          />
        </div>
        <ReportDataTable
          title={t("dashboard.reports.detail.companyList", "Companies")}
          emptyLabel={empty}
          rows={[...model.companies]
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
            .slice(0, 100)}
          columns={[
            {
              id: "name",
              header: t("dashboard.reports.detail.company", "Company"),
              cell: (row) => row.name,
            },
            {
              id: "status",
              header: t("dashboard.reports.center.colStatus"),
              cell: (row) => translateReportLabel(t, row.status),
            },
            {
              id: "plan",
              header: t("dashboard.reports.detail.plan", "Plan"),
              cell: (row) =>
                translateReportLabel(t, row.plan?.display_name ?? row.plan?.name ?? row.subscription_plan),
            },
            {
              id: "subscription",
              header: t("dashboard.reports.detail.subscription", "Subscription"),
              cell: (row) => translateReportLabel(t, row.subscription_status),
            },
            {
              id: "created",
              header: t("dashboard.reports.center.colDate"),
              cell: (row) => row.created_at?.slice(0, 10) ?? "—",
            },
          ]}
        />
      </ReportSection>
    );
  }

  if (report.id === "company_revenue") {
    const m = model.revenueMetrics;
    return (
      <ReportSection>
        <ReportKpiStrip
          loading={model.loading}
          items={[
            {
              id: "mrr",
              label: t("dashboard.reports.detail.mrr", "MRR"),
              value: formatCurrency(m?.mrr ?? 0),
              icon: DollarSign,
            },
            {
              id: "arr",
              label: t("dashboard.reports.detail.arr", "ARR"),
              value: formatCurrency(m?.arr ?? 0),
              icon: BarChart3,
            },
            {
              id: "active",
              label: t("dashboard.reports.detail.activeSubs", "Active subscriptions"),
              value: m?.active_subscriptions ?? 0,
              icon: Building2,
            },
            {
              id: "failed",
              label: t("dashboard.reports.detail.failedPayments", "Failed payments (30d)"),
              value: m?.failed_payments_30d ?? 0,
              icon: Activity,
              trend:
                m != null
                  ? `${t("dashboard.reports.detail.failRate", "Fail rate")}: ${Math.round((m.failed_payment_rate || 0) * 100)}%`
                  : undefined,
            },
          ]}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <ReportStatusBreakdown
            title={t("dashboard.reports.detail.subscriptionMix", "Subscription mix")}
            emptyLabel={empty}
            slices={[
              {
                id: "active",
                label: t("dashboard.reports.detail.active", "Active"),
                value: m?.active_subscriptions ?? 0,
                color: "bg-emerald-500",
              },
              {
                id: "trial",
                label: t("dashboard.reports.detail.trialing", "Trialing"),
                value: m?.trialing_subscriptions ?? 0,
                color: "bg-sky-500",
              },
            ]}
          />
          <ReportStatusBreakdown
            title={t("dashboard.reports.detail.companyStatusMix", "Company status")}
            emptyLabel={empty}
            slices={countByKey(model.companies, (c) => c.subscription_status)}
          />
        </div>
        <ReportDataTable
          title={t("dashboard.reports.detail.platformPayments", "Recent platform payments")}
          emptyLabel={empty}
          rows={model.platformPayments.slice(0, 50)}
          columns={[
            {
              id: "label",
              header: t("dashboard.reports.detail.company", "Company"),
              cell: (row) => row.label,
            },
            {
              id: "amount",
              header: t("dashboard.reports.center.colAmount"),
              cell: (row) => formatCurrency(row.amount),
            },
            {
              id: "status",
              header: t("dashboard.reports.center.colStatus"),
              cell: (row) => row.status,
            },
            {
              id: "date",
              header: t("dashboard.reports.center.colDate"),
              cell: (row) => row.date.slice(0, 10) || "—",
            },
          ]}
        />
      </ReportSection>
    );
  }

  if (report.id === "subscriptions") {
    return (
      <ReportSection>
        <ReportKpiStrip
          loading={model.loading}
          items={[
            {
              id: "total",
              label: t("dashboard.reports.catalog.subscriptions"),
              value: model.subscriptions.length,
              icon: Building2,
            },
            {
              id: "mrr",
              label: t("dashboard.reports.detail.mrr", "MRR"),
              value: formatCurrency(model.revenueMetrics?.mrr ?? 0),
              icon: DollarSign,
            },
            {
              id: "trial",
              label: t("dashboard.reports.detail.trialing", "Trialing"),
              value: model.revenueMetrics?.trialing_subscriptions ?? 0,
              icon: Coins,
            },
          ]}
        />
        <ReportStatusBreakdown
          title={t("dashboard.reports.detail.byStatus", "By status")}
          emptyLabel={empty}
          slices={countByKey(model.subscriptions, (s) => s.status).map((s) => ({
            ...s,
            label: translateReportLabel(t, s.label),
          }))}
        />
        <ReportDataTable
          title={t("dashboard.reports.detail.subscriptionList", "Subscriptions")}
          emptyLabel={empty}
          rows={model.subscriptions.slice(0, 100)}
          columns={[
            {
              id: "company",
              header: t("dashboard.reports.detail.company", "Company"),
              cell: (row) => row.company_name || "—",
            },
            {
              id: "plan",
              header: t("dashboard.reports.detail.plan", "Plan"),
              cell: (row) => translateReportLabel(t, row.plan_name),
            },
            {
              id: "status",
              header: t("dashboard.reports.center.colStatus"),
              cell: (row) => translateReportLabel(t, row.status),
            },
            {
              id: "cycle",
              header: t("dashboard.reports.detail.billingCycle", "Billing cycle"),
              cell: (row) => translateReportLabel(t, row.billing_cycle),
            },
            {
              id: "renewal",
              header: t("dashboard.reports.detail.renewal", "Renewal"),
              cell: (row) => row.renewal_at?.slice(0, 10) ?? "—",
            },
          ]}
        />
      </ReportSection>
    );
  }

  if (report.id === "executive") {
    const sections = model.executiveReport?.sections ?? [];
    const snap = model.executiveDashboard;
    const unpaidAmount = model.invoices
      .filter((inv) => inv.status === "Unpaid" || inv.status === "Overdue")
      .reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
    const translateMetric = (key: string) => {
      const map: Record<string, string> = {
        "Today's Revenue": t("dashboard.reports.executive.todayRevenue"),
        "Monthly Revenue": t("dashboard.reports.executive.monthlyRevenue"),
        "Bookings Today": t("dashboard.reports.executive.bookingsToday"),
        Outstanding: t("dashboard.reports.executive.outstanding"),
        "Completion Rate": t("dashboard.reports.executive.completionRate"),
        "Cancellation Rate": t("dashboard.reports.executive.cancellationRate"),
        "No-Show Rate": t("dashboard.reports.executive.noShowRate"),
        "Capacity Utilization": t("dashboard.reports.executive.capacityUtilization"),
        Revenue: t("dashboard.reports.stats.revenue"),
        "Outstanding Invoices": t("dashboard.reports.executive.outstandingInvoices"),
        "Refund Rate": t("dashboard.reports.executive.refundRate"),
        Collections: t("dashboard.reports.executive.collections"),
        Delivered: t("dashboard.reports.executive.delivered"),
        Failed: t("dashboard.reports.executive.failed"),
        "Delivery Success": t("dashboard.reports.executive.deliverySuccess"),
        "New Customers": t("dashboard.reports.center.kpis.newCustomers"),
        "Retention Rate": t("dashboard.reports.executive.retentionRate"),
        "Portal Usage": t("dashboard.reports.executive.portalUsage"),
        "Executive Summary": t("dashboard.reports.catalog.executive"),
        "Operational KPIs": t("dashboard.reports.executive.operationalKpis"),
        "Financial KPIs": t("dashboard.reports.executive.financialKpis"),
        Communication: t("dashboard.reports.executive.communication"),
        Customer: t("dashboard.reports.detail.customer"),
      };
      return map[key] ?? key;
    };

    return (
      <ReportSection>
        <ReportKpiStrip
          loading={false}
          items={[
            {
              id: "todayRevenue",
              label: t("dashboard.reports.executive.todayRevenue"),
              value: formatCurrency(
                snap
                  ? Number(snap.summary.todayRevenueCents || 0) / 100
                  : model.overview.revenue,
              ),
              icon: DollarSign,
            },
            {
              id: "monthlyRevenue",
              label: t("dashboard.reports.executive.monthlyRevenue"),
              value: formatCurrency(
                snap
                  ? Number(snap.summary.monthlyRevenueCents || 0) / 100
                  : model.overview.revenue,
              ),
              icon: BarChart3,
            },
            {
              id: "bookingsToday",
              label: t("dashboard.reports.executive.bookingsToday"),
              value: snap?.summary.bookingsToday ?? model.overview.bookings,
              icon: CalendarDays,
            },
            {
              id: "outstanding",
              label: t("dashboard.reports.executive.outstanding"),
              value: formatCurrency(
                snap ? Number(snap.summary.outstandingBalanceCents || 0) / 100 : unpaidAmount,
              ),
              icon: Coins,
            },
          ]}
        />

        <ReportKpiStrip
          loading={false}
          items={[
            {
              id: "customers",
              label: t("dashboard.reports.stats.customers"),
              value: model.overview.customers,
              icon: Users,
            },
            {
              id: "bookings",
              label: t("dashboard.reports.stats.bookings"),
              value: model.overview.bookings,
              icon: CalendarDays,
            },
            {
              id: "invoices",
              label: t("dashboard.reports.stats.invoices"),
              value: model.overview.invoices,
              icon: FileText,
            },
            {
              id: "revenue",
              label: t("dashboard.reports.stats.revenue"),
              value: formatCurrency(model.overview.revenue),
              icon: DollarSign,
            },
          ]}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <ReportStatusBreakdown
            title={t("dashboard.reports.center.bookingStatus")}
            emptyLabel={empty}
            slices={countByKey(model.bookings, (b) => b.status).map((s) => ({
              ...s,
              label: translateReportLabel(t, s.label),
            }))}
          />
          <ReportStatusBreakdown
            title={t("dashboard.reports.invoiceBreakdown")}
            emptyLabel={empty}
            slices={countByKey(model.invoices, (inv) => inv.status).map((s) => ({
              ...s,
              label: translateReportLabel(t, s.label),
            }))}
          />
        </div>

        {snap ? (
          <div className="grid gap-4 md:grid-cols-2">
            <ReportStatusBreakdown
              title={t("dashboard.reports.executive.operationalKpis")}
              emptyLabel={empty}
              slices={[
                {
                  id: "completion",
                  label: t("dashboard.reports.executive.completionRate"),
                  value: Math.max(1, Math.round(Number(snap.operational.completionRate || 0))),
                  color: "bg-emerald-500",
                },
                {
                  id: "cancel",
                  label: t("dashboard.reports.executive.cancellationRate"),
                  value: Math.max(0, Math.round(Number(snap.operational.cancellationRate || 0))),
                  color: "bg-amber-500",
                },
                {
                  id: "noshow",
                  label: t("dashboard.reports.executive.noShowRate"),
                  value: Math.max(0, Math.round(Number(snap.operational.noShowRate || 0))),
                  color: "bg-rose-500",
                },
              ]}
            />
            <ReportStatusBreakdown
              title={t("dashboard.reports.executive.financialKpis")}
              emptyLabel={empty}
              slices={[
                {
                  id: "revenue",
                  label: t("dashboard.reports.stats.revenue"),
                  value: Math.max(0, Math.round(Number(snap.financial.revenueCents || 0) / 100)),
                  color: "bg-sky-500",
                },
                {
                  id: "collections",
                  label: t("dashboard.reports.executive.collections"),
                  value: Math.max(0, Math.round(Number(snap.financial.collectionsCents || 0) / 100)),
                  color: "bg-emerald-500",
                },
                {
                  id: "outstandingInv",
                  label: t("dashboard.reports.executive.outstandingInvoices"),
                  value: Math.max(
                    0,
                    Math.round(Number(snap.financial.outstandingInvoicesCents || 0) / 100),
                  ),
                  color: "bg-amber-500",
                },
              ]}
            />
          </div>
        ) : null}

        {model.executiveLoading ? (
          <DashboardCard className="p-5 text-sm text-muted-foreground">
            {t("dashboard.reports.executive.loadingEngine", "Loading executive engine…")}
          </DashboardCard>
        ) : null}

        {sections.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {sections.map((section) => (
              <DashboardCard key={section.heading} className="p-5">
                <h3 className="mb-3 text-sm font-semibold">{translateMetric(section.heading)}</h3>
                <dl className="space-y-2">
                  {Object.entries(section.metrics).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between gap-3 text-sm">
                      <dt className="text-muted-foreground">{translateMetric(key)}</dt>
                      <dd className="font-medium tabular-nums">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </DashboardCard>
            ))}
          </div>
        ) : (
          <DashboardCard className="p-5">
            <h3 className="text-sm font-semibold">{t("dashboard.reports.catalog.executive")}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                "dashboard.reports.executive.liveFromCompany",
                "Showing live company KPIs from bookings, customers, and invoices. Executive engine sections appear when available.",
              )}
            </p>
          </DashboardCard>
        )}
      </ReportSection>
    );
  }

  if (report.id === "ai_consumption") {
    const ai = model.aiUsageMetrics;
    const cost = model.aiCostAggregate;
    const analytics = model.aiAnalytics;
    const currency = cost?.currency || ai?.currency || "USD";
    const formatAiMoney = (value: number) => `${currency} ${Number(value || 0).toFixed(4)}`;
    const providerSlices = Object.entries(cost?.byProvider ?? {}).map(([id, stats]) => ({
      id,
      label: id,
      value: Number(stats.totalTokens || 0),
    }));
    const statusSlices = Object.entries(analytics?.byStatus ?? {}).map(([id, value]) => ({
      id,
      label: translateReportLabel(t, id),
      value: Number(value || 0),
    }));

    return (
      <ReportSection>
        <ReportKpiStrip
          loading={model.loading}
          items={[
            {
              id: "tokens",
              label: t("dashboard.reports.ai.tokensUsed"),
              value: (ai?.used ?? cost?.totalTokens ?? 0).toLocaleString(),
              icon: Zap,
            },
            {
              id: "cost",
              label: t("dashboard.reports.ai.estimatedCost"),
              value: formatAiMoney(ai?.costThisMonth ?? cost?.totalCost ?? 0),
              icon: Coins,
            },
            {
              id: "quota",
              label: t("dashboard.reports.ai.quotaUsed"),
              value:
                ai?.quotaPctRaw != null
                  ? `${ai.quotaPctRaw}%`
                  : t("dashboard.reports.ai.unlimited"),
              icon: Gauge,
              trend:
                ai?.monthlyQuota != null
                  ? `${(ai.used ?? 0).toLocaleString()} / ${ai.monthlyQuota.toLocaleString()}`
                  : undefined,
            },
            {
              id: "requests",
              label: t("dashboard.reports.ai.requests"),
              value: ai?.requestsThisMonth ?? cost?.recordCount ?? analytics?.totalExecutions ?? 0,
              icon: Cpu,
            },
          ]}
        />

        <ReportKpiStrip
          loading={model.loading}
          items={[
            {
              id: "overage",
              label: t("dashboard.reports.ai.overageTokens"),
              value: (ai?.overageTokens ?? 0).toLocaleString(),
              icon: Activity,
            },
            {
              id: "extraCost",
              label: t("dashboard.reports.ai.estimatedExtraCost"),
              value: formatAiMoney(ai?.estimatedExtraCost ?? 0),
              icon: DollarSign,
            },
            {
              id: "latency",
              label: t("dashboard.reports.ai.avgLatency"),
              value:
                analytics?.averageLatencyMs != null
                  ? `${Math.round(analytics.averageLatencyMs)} ms`
                  : "—",
              icon: BarChart3,
            },
            {
              id: "success",
              label: t("dashboard.reports.ai.successRate"),
              value: ai?.successPct != null ? `${ai.successPct}%` : "—",
              icon: PieChart,
            },
          ]}
        />

        <ReportKpiStrip
          loading={model.loading}
          items={[
            {
              id: "storage",
              label: t("dashboard.reports.ai.storageMb"),
              value: (model.companyUsageMetrics?.storageMb ?? 0).toLocaleString(),
              icon: Package,
            },
            {
              id: "api",
              label: t("dashboard.reports.ai.apiCalls"),
              value: (model.companyUsageMetrics?.apiCalls ?? 0).toLocaleString(),
              icon: Activity,
            },
          ]}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <ReportStatusBreakdown
            title={t("dashboard.reports.ai.byProvider")}
            emptyLabel={t("dashboard.reports.ai.noUsage")}
            slices={providerSlices}
          />
          <ReportStatusBreakdown
            title={t("dashboard.reports.ai.byStatus")}
            emptyLabel={t("dashboard.reports.ai.noUsage")}
            slices={statusSlices.length > 0 ? statusSlices : providerSlices}
          />
        </div>

        {(ai?.topModels?.length ?? 0) > 0 ? (
          <ReportDataTable
            title={t("dashboard.reports.ai.topModels")}
            emptyLabel={t("dashboard.reports.ai.noUsage")}
            rows={(ai?.topModels ?? []).map((row) => ({
              id: row.key,
              label: row.label,
              tokens: row.tokens,
              requests: row.requests,
              cost: row.cost ?? 0,
            }))}
            columns={[
              {
                id: "label",
                header: t("dashboard.reports.ai.model"),
                cell: (row) => row.label,
              },
              {
                id: "tokens",
                header: t("dashboard.reports.ai.tokens"),
                cell: (row) => row.tokens.toLocaleString(),
              },
              {
                id: "requests",
                header: t("dashboard.reports.ai.requests"),
                cell: (row) => row.requests.toLocaleString(),
              },
              {
                id: "cost",
                header: t("dashboard.reports.ai.estimatedCost"),
                cell: (row) => formatAiMoney(row.cost),
              },
            ]}
          />
        ) : null}

        <ReportDataTable
          title={t("dashboard.reports.ai.recentCharges")}
          emptyLabel={t("dashboard.reports.ai.noUsage")}
          rows={model.aiCostRecords.slice(0, 50).map((row) => ({
            id: row.id,
            provider: row.provider_key ?? "—",
            model: row.model ?? "—",
            tokens: Number(row.total_tokens ?? 0),
            cost: Number(row.estimated_cost ?? 0),
            at: row.recorded_at?.slice(0, 16).replace("T", " ") ?? "—",
          }))}
          columns={[
            {
              id: "provider",
              header: t("dashboard.reports.ai.provider"),
              cell: (row) => row.provider,
            },
            {
              id: "model",
              header: t("dashboard.reports.ai.model"),
              cell: (row) => row.model,
            },
            {
              id: "tokens",
              header: t("dashboard.reports.ai.tokens"),
              cell: (row) => row.tokens.toLocaleString(),
            },
            {
              id: "cost",
              header: t("dashboard.reports.ai.estimatedCost"),
              cell: (row) => formatAiMoney(row.cost),
            },
            {
              id: "at",
              header: t("dashboard.reports.center.colDate"),
              cell: (row) => row.at,
            },
          ]}
        />

        <ReportDataTable
          title={t("dashboard.reports.ai.companyConsumption")}
          emptyLabel={t("dashboard.reports.ai.noCompanyConsumption")}
          rows={[...model.companyAiConsumption]
            .sort((a, b) => (b.usagePct ?? -1) - (a.usagePct ?? -1))
            .slice(0, 100)}
          columns={[
            {
              id: "company",
              header: t("dashboard.reports.detail.company"),
              cell: (row) => row.companyName,
            },
            {
              id: "plan",
              header: t("dashboard.reports.detail.plan"),
              cell: (row) => translateReportLabel(t, row.planName),
            },
            {
              id: "tokens",
              header: t("dashboard.reports.ai.tokensUsed"),
              cell: (row) =>
                row.aiTokenLimit != null
                  ? `${row.aiTokensUsed.toLocaleString()} / ${row.aiTokenLimit.toLocaleString()}`
                  : row.aiTokensUsed.toLocaleString(),
            },
            {
              id: "rate",
              header: t("dashboard.reports.ai.consumptionRate"),
              cell: (row) => (row.usagePct != null ? `${row.usagePct}%` : "—"),
            },
            {
              id: "storage",
              header: t("dashboard.reports.ai.storageMb"),
              cell: (row) => row.storageMb.toLocaleString(),
            },
            {
              id: "api",
              header: t("dashboard.reports.ai.apiCalls"),
              cell: (row) => row.apiCalls.toLocaleString(),
            },
          ]}
        />
      </ReportSection>
    );
  }

  return (
    <DashboardCard className="p-6 text-sm text-muted-foreground">
      {t("dashboard.reports.unsupported", "This report is not available yet.")}
    </DashboardCard>
  );
}
