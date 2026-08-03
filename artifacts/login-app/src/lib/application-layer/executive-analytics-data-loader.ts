import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnalyticsChartPoint,
  AnalyticsFilter,
  AnalyticsKpiValue,
  AnalyticsRankedItem,
  ExecutiveAnalyticsSnapshotModel,
} from "@workspace/application-layer";
import { RevenueReportService } from "@/lib/billing/reports/revenue-report-service";

type PeriodWindow = Readonly<{ from: string; to: string; previousFrom: string; previousTo: string }>;

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function resolvePeriodWindow(filter: AnalyticsFilter): PeriodWindow {
  const now = new Date();
  const period = filter.period ?? "30d";

  if (period === "custom" && filter.from && filter.to) {
    const from = new Date(filter.from).toISOString();
    const to = new Date(filter.to).toISOString();
    const spanMs = new Date(to).getTime() - new Date(from).getTime();
    const previousTo = new Date(new Date(from).getTime() - 1).toISOString();
    const previousFrom = new Date(new Date(from).getTime() - spanMs).toISOString();
    return { from, to, previousFrom, previousTo };
  }

  const fromDate = startOfDay(
    period === "today"
      ? now
      : period === "yesterday"
        ? addDays(now, -1)
        : period === "week" || period === "7d"
          ? addDays(now, -7)
          : period === "month" || period === "30d"
            ? addDays(now, -30)
            : period === "quarter"
              ? addDays(now, -90)
              : addDays(now, period === "year" ? -365 : -90),
  );

  const spanDays =
    period === "today" || period === "yesterday"
      ? 1
      : period === "week" || period === "7d"
        ? 7
        : period === "month" || period === "30d"
          ? 30
          : period === "quarter"
            ? 90
            : period === "year"
              ? 365
              : 90;

  const previousFromDate = startOfDay(addDays(fromDate, -spanDays));

  return {
    from: fromDate.toISOString(),
    to: now.toISOString(),
    previousFrom: previousFromDate.toISOString(),
    previousTo: fromDate.toISOString(),
  };
}

function trend(current: number, previous: number): AnalyticsKpiValue["trend"] {
  if (current === previous) return "flat";
  return current > previous ? "up" : "down";
}

function sumPaymentsInRange(
  rows: ReadonlyArray<{ amount_cents: number; created_at: string; paid_at?: string | null }>,
  from: string,
  to: string,
): number {
  return rows.reduce((sum, row) => {
    const ts = String(row.paid_at ?? row.created_at);
    if (ts >= from && ts <= to) return sum + Number(row.amount_cents);
    return sum;
  }, 0);
}

export class ExecutiveAnalyticsDataLoader {
  private readonly revenueReports: RevenueReportService;

  constructor(private readonly client: SupabaseClient) {
    this.revenueReports = new RevenueReportService(client);
  }

  async loadExecutiveSnapshot(companyId: string, filter: AnalyticsFilter): Promise<ExecutiveAnalyticsSnapshotModel> {
    const window = resolvePeriodWindow(filter);

    const [
      revenueMetrics,
      paymentsResult,
      invoicesResult,
      bookingsResult,
      customersResult,
      leadsResult,
      refundsTodayResult,
      resourcesResult,
    ] = await Promise.all([
      this.revenueReports.getMetrics(companyId),
      this.client
        .from("customer_payments")
        .select("amount_cents, created_at, paid_at, status, payment_method, customer_id")
        .eq("company_id", companyId)
        .eq("status", "completed"),
      this.client
        .from("invoices")
        .select("total_cents, paid_cents, status, created_at, branch_id")
        .eq("company_id", companyId)
        .eq("invoice_type", "customer"),
      this.client
        .from("scheduling_bookings")
        .select("id, status, start_at, end_at, branch_id, resource_id, customer_id, service_id, scheduling_resources(name), branches(name), scheduling_services(name, price_cents)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("start_at", window.previousFrom)
        .lte("start_at", window.to),
      this.client.from("customers").select("id, name, created_at").eq("company_id", companyId),
      this.client.from("leads").select("id, lifecycle_status").eq("company_id", companyId).is("deleted_at", null),
      this.client
        .from("financial_refunds")
        .select("amount_cents, created_at, status")
        .eq("company_id", companyId)
        .eq("status", "completed")
        .gte("created_at", startOfDay(new Date()).toISOString()),
      this.client.from("scheduling_resources").select("id, name").eq("company_id", companyId).eq("is_active", true),
    ]);

    if (paymentsResult.error) throw new Error(paymentsResult.error.message);
    if (invoicesResult.error) throw new Error(invoicesResult.error.message);
    if (bookingsResult.error) throw new Error(bookingsResult.error.message);
    if (customersResult.error) throw new Error(customersResult.error.message);
    if (leadsResult.error) throw new Error(leadsResult.error.message);

    const payments = paymentsResult.data ?? [];
    const invoices = invoicesResult.data ?? [];
    let bookings = bookingsResult.data ?? [];

    if (filter.branchId) bookings = bookings.filter((b) => String(b.branch_id) === filter.branchId);
    if (filter.employeeId) bookings = bookings.filter((b) => String(b.resource_id) === filter.employeeId);
    if (filter.serviceId) bookings = bookings.filter((b) => String(b.service_id) === filter.serviceId);

    const revenueCurrent = sumPaymentsInRange(payments, window.from, window.to);
    const revenuePrevious = filter.comparePrevious === false ? 0 : sumPaymentsInRange(payments, window.previousFrom, window.previousTo);
    const collectedToday = sumPaymentsInRange(payments, startOfDay(new Date()).toISOString(), new Date().toISOString());
    const refundsToday = (refundsTodayResult.data ?? []).reduce((sum, row) => sum + Number(row.amount_cents), 0);

    const outstandingCents = invoices
      .filter((inv) => !["paid", "cancelled", "refunded"].includes(String(inv.status).toLowerCase()))
      .reduce((sum, inv) => sum + Math.max(0, Number(inv.total_cents) - Number(inv.paid_cents ?? 0)), 0);

    const pendingPayments = invoices.filter(
      (inv) => Number(inv.paid_cents ?? 0) < Number(inv.total_cents) && !["cancelled", "refunded"].includes(String(inv.status).toLowerCase()),
    ).length;

    const periodBookings = bookings.filter((b) => String(b.start_at) >= window.from && String(b.start_at) <= window.to);
    const todayStart = startOfDay(new Date()).toISOString();
    const bookingsToday = bookings.filter((b) => String(b.start_at) >= todayStart).length;
    const upcomingBookings = bookings.filter((b) => {
      const ts = new Date(String(b.start_at)).getTime();
      return ts >= Date.now() && ts <= Date.now() + 60 * 60 * 1000;
    }).length;
    const completedOperations = periodBookings.filter((b) => String(b.status) === "completed").length;
    const cancelledOperations = periodBookings.filter((b) => String(b.status) === "cancelled").length;
    const noShows = periodBookings.filter((b) => String(b.status) === "no_show").length;
    const noShowRate = periodBookings.length > 0 ? (noShows / periodBookings.length) * 100 : 0;

    const waitingMinutes = periodBookings
      .filter((b) => ["checked_in", "confirmed", "pending"].includes(String(b.status)))
      .map((b) => Math.max(0, (Date.now() - new Date(String(b.start_at)).getTime()) / 60_000));
    const avgWaiting = waitingMinutes.length ? waitingMinutes.reduce((a, b) => a + b, 0) / waitingMinutes.length : 0;

    const durations = periodBookings
      .filter((b) => b.end_at && b.start_at)
      .map((b) => (new Date(String(b.end_at)).getTime() - new Date(String(b.start_at)).getTime()) / 60_000)
      .filter((m) => m > 0);
    const avgServiceDuration = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    const customers = customersResult.data ?? [];
    const newCustomers = customers.filter((c) => String(c.created_at) >= window.from).length;
    const leads = leadsResult.data ?? [];
    const convertedLeads = leads.filter((l) => l.lifecycle_status === "converted").length;
    const conversionRate = leads.length > 0 ? (convertedLeads / leads.length) * 100 : 0;

    const customerRevenue = new Map<string, number>();
    for (const payment of payments) {
      if (!payment.customer_id) continue;
      const cid = String(payment.customer_id);
      customerRevenue.set(cid, (customerRevenue.get(cid) ?? 0) + Number(payment.amount_cents));
    }
    const topCustomers: AnalyticsRankedItem[] = [...customerRevenue.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, value]) => ({
        id,
        name: customers.find((c) => String(c.id) === id)?.name ?? "Customer",
        value,
      }));

    const employeeRevenue = new Map<string, { name: string; value: number; count: number }>();
    for (const booking of periodBookings) {
      const resource = booking.scheduling_resources as { name?: string } | { name?: string }[] | null;
      const name = Array.isArray(resource) ? resource[0]?.name ?? "Resource" : resource?.name ?? "Resource";
      const id = String(booking.resource_id ?? "unknown");
      const service = booking.scheduling_services as { price_cents?: number } | { price_cents?: number }[] | null;
      const price = Array.isArray(service) ? Number(service[0]?.price_cents ?? 0) : Number(service?.price_cents ?? 0);
      const existing = employeeRevenue.get(id) ?? { name, value: 0, count: 0 };
      employeeRevenue.set(id, { name, value: existing.value + price, count: existing.count + 1 });
    }

    const topEmployees = [...employeeRevenue.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .slice(0, 5)
      .map(([id, data]) => Object.freeze({ id, name: data.name, value: data.value, count: data.count }));

    const serviceRevenue = new Map<string, { name: string; value: number; count: number }>();
    for (const booking of periodBookings) {
      const service = booking.scheduling_services as { name?: string; price_cents?: number } | { name?: string; price_cents?: number }[] | null;
      const id = String(booking.service_id ?? "unknown");
      const name = Array.isArray(service) ? service[0]?.name ?? "Service" : service?.name ?? "Service";
      const price = Array.isArray(service) ? Number(service[0]?.price_cents ?? 0) : Number(service?.price_cents ?? 0);
      const existing = serviceRevenue.get(id) ?? { name, value: 0, count: 0 };
      serviceRevenue.set(id, { name, value: existing.value + price, count: existing.count + 1 });
    }

    const topServices = [...serviceRevenue.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .slice(0, 5)
      .map(([id, data]) => Object.freeze({ id, name: data.name, value: data.value, count: data.count }));

    const branchRevenue = new Map<string, { name: string; value: number }>();
    for (const booking of periodBookings) {
      const branch = booking.branches as { name?: string } | { name?: string }[] | null;
      const id = String(booking.branch_id ?? "unknown");
      const name = Array.isArray(branch) ? branch[0]?.name ?? "Branch" : branch?.name ?? "Branch";
      const service = booking.scheduling_services as { price_cents?: number } | { price_cents?: number }[] | null;
      const price = Array.isArray(service) ? Number(service[0]?.price_cents ?? 0) : Number(service?.price_cents ?? 0);
      const existing = branchRevenue.get(id) ?? { name, value: 0 };
      branchRevenue.set(id, { name, value: existing.value + price });
    }

    const topBranches = [...branchRevenue.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .slice(0, 5)
      .map(([id, data]) => Object.freeze({ id, name: data.name, value: data.value }));

    const paymentMethods = new Map<string, { value: number; count: number }>();
    for (const payment of payments.filter((p) => String(p.created_at) >= window.from)) {
      const method = String(payment.payment_method ?? "unknown");
      const existing = paymentMethods.get(method) ?? { value: 0, count: 0 };
      paymentMethods.set(method, { value: existing.value + Number(payment.amount_cents), count: existing.count + 1 });
    }

    const resourceCount = Math.max(1, (resourcesResult.data ?? []).length);
    const bookedHours = durations.reduce((sum, m) => sum + m, 0) / 60;
    const capacityHours = resourceCount * 8;
    const utilization = capacityHours > 0 ? Math.min(100, (bookedHours / capacityHours) * 100) : 0;

    const charts = this.buildCharts(payments, customers, bookings);

    const kpis: AnalyticsKpiValue[] = [
      { key: "finance.revenue.today", label: "Today's Revenue", value: collectedToday, previousValue: revenuePrevious, unit: "currency", trend: trend(collectedToday, revenuePrevious), category: "finance" },
      { key: "finance.revenue", label: "Period Revenue", value: revenueCurrent, previousValue: revenuePrevious, unit: "currency", trend: trend(revenueCurrent, revenuePrevious), category: "finance" },
      { key: "finance.revenue.weekly", label: "Weekly Revenue", value: revenueMetrics.monthlyCents, unit: "currency", category: "finance" },
      { key: "finance.revenue.monthly", label: "Monthly Revenue", value: revenueMetrics.monthlyCents, unit: "currency", category: "finance" },
      { key: "finance.revenue.yearly", label: "Yearly Revenue", value: revenueMetrics.yearlyCents, unit: "currency", category: "finance" },
      { key: "finance.outstanding", label: "Outstanding Balance", value: outstandingCents, unit: "currency", category: "finance" },
      { key: "finance.collected_today", label: "Collected Today", value: collectedToday, unit: "currency", category: "finance" },
      { key: "finance.refunds_today", label: "Refunds Today", value: refundsToday, unit: "currency", category: "finance" },
      { key: "payments.pending", label: "Pending Payments", value: pendingPayments, unit: "count", category: "payments" },
      { key: "bookings.today", label: "Bookings Today", value: bookingsToday, unit: "count", category: "bookings" },
      { key: "bookings.upcoming", label: "Upcoming Bookings", value: upcomingBookings, unit: "count", category: "bookings" },
      { key: "bookings.total", label: "Period Bookings", value: periodBookings.length, unit: "count", category: "bookings" },
      { key: "operations.completed", label: "Completed Operations", value: completedOperations, unit: "count", category: "operations" },
      { key: "operations.cancelled", label: "Cancelled Operations", value: cancelledOperations, unit: "count", category: "operations" },
      { key: "operations.no_shows", label: "No Shows", value: noShows, unit: "count", category: "operations" },
      { key: "operations.no_show_rate", label: "No-show Rate", value: noShowRate, unit: "percent", category: "operations" },
      { key: "operations.waiting_avg", label: "Average Waiting Time", value: avgWaiting, unit: "minutes", category: "operations" },
      { key: "operations.service_duration_avg", label: "Average Service Duration", value: avgServiceDuration, unit: "minutes", category: "operations" },
      { key: "operations.utilization", label: "Resource Utilization", value: utilization, unit: "percent", category: "operations" },
      { key: "customers.total", label: "Total Customers", value: customers.length, unit: "count", category: "customers" },
      { key: "customers.new", label: "New Customers", value: newCustomers, unit: "count", category: "customers" },
      { key: "customers.lifetime_value", label: "Customer Lifetime Value", value: topCustomers[0]?.value ?? 0, unit: "currency", category: "customers" },
      { key: "customers.conversion_rate", label: "Lead Conversion", value: conversionRate, unit: "percent", category: "customers" },
      { key: "customers.growth", label: "Customer Growth", value: newCustomers, unit: "count", category: "customers" },
      { key: "invoices.outstanding", label: "Outstanding Invoices", value: outstandingCents, unit: "currency", category: "finance" },
      { key: "crm.customers.total", label: "Customers", value: customers.length, unit: "count", category: "customers" },
      { key: "crm.pipeline.value", label: "Pipeline", value: outstandingCents, unit: "currency", category: "finance" },
    ];

    return Object.freeze({
      capturedAt: new Date().toISOString(),
      currency: "USD",
      kpis: Object.freeze(kpis),
      charts,
      rankings: Object.freeze({
        customers: Object.freeze(topCustomers),
        employees: Object.freeze(topEmployees),
        services: Object.freeze(topServices),
        branches: Object.freeze(topBranches),
      }),
      breakdowns: Object.freeze({
        revenueByBranch: Object.freeze(topBranches),
        revenueByEmployee: Object.freeze(topEmployees),
        revenueByService: Object.freeze(topServices),
        paymentMethods: Object.freeze(
          [...paymentMethods.entries()].map(([id, data]) =>
            Object.freeze({ id, name: id, value: data.value, count: data.count }),
          ),
        ),
      }),
    });
  }

  private buildCharts(
    payments: ReadonlyArray<{ amount_cents: number; created_at: string; paid_at?: string | null }>,
    customers: ReadonlyArray<{ created_at: string }>,
    bookings: ReadonlyArray<{ start_at: string }>,
  ): Readonly<Record<string, readonly AnalyticsChartPoint[]>> {
    const days = 7;
    const revenueSeries: AnalyticsChartPoint[] = [];
    const customerSeries: AnalyticsChartPoint[] = [];
    const bookingSeries: AnalyticsChartPoint[] = [];

    for (let i = days - 1; i >= 0; i -= 1) {
      const day = startOfDay(addDays(new Date(), -i));
      const next = startOfDay(addDays(day, 1));
      const label = day.toLocaleDateString(undefined, { weekday: "short" });
      revenueSeries.push({
        label,
        value: sumPaymentsInRange(payments, day.toISOString(), next.toISOString()) / 100,
      });
      customerSeries.push({
        label,
        value: customers.filter((c) => {
          const ts = String(c.created_at);
          return ts >= day.toISOString() && ts < next.toISOString();
        }).length,
      });
      bookingSeries.push({
        label,
        value: bookings.filter((b) => {
          const ts = String(b.start_at);
          return ts >= day.toISOString() && ts < next.toISOString();
        }).length,
      });
    }

    return Object.freeze({
      "finance.revenue": Object.freeze(revenueSeries),
      "crm.customers.new": Object.freeze(customerSeries),
      "bookings.total": Object.freeze(bookingSeries),
    });
  }
}
