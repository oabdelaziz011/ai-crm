import type { SupabaseClient } from "@supabase/supabase-js";
import { getFinancialPlatformServices } from "@/lib/billing/services/financial-platform-service";
import { getCommunicationPlatform } from "@/lib/communication/services/communication-platform-service";
import { PortalAnalyticsService } from "@/lib/customer-portal/selectors/portal-analytics-service";
import type { RawExecutiveData } from "@/lib/executive/types";

/** Aggregates data from all platforms — no UI queries. */
export class ExecutiveDataRepository {
  private readonly portalAnalytics: PortalAnalyticsService;

  constructor(private readonly client: SupabaseClient) {
    this.portalAnalytics = new PortalAnalyticsService(client);
  }

  async loadRawData(companyId: string, date: string, branchId?: string | null): Promise<RawExecutiveData> {
    const financial = getFinancialPlatformServices();
    const communication = getCommunicationPlatform();

    const [financialMetrics, communicationStats, portalAnalytics, bookingsToday, branches, customers, payments, tax, providerBreakdown, bookingsHistory] =
      await Promise.all([
        financial.reports.getMetrics(companyId),
        communication.history.stats(companyId),
        this.portalAnalytics.snapshot(companyId),
        this.loadBookingsForDate(companyId, date, branchId),
        this.loadBranches(companyId),
        this.loadCustomerStats(companyId),
        this.loadPaymentsToday(companyId, date),
        this.loadTaxCollected(companyId),
        financial.reports.getBreakdown(companyId, "provider"),
        this.loadBookingsHistory(companyId, 14),
      ]);

    return {
      financialMetrics,
      communicationStats,
      portalAnalytics,
      bookingsToday,
      bookingsHistory,
      customers,
      branches,
      paymentsTodayCents: payments,
      taxCollectedCents: tax,
      providerBreakdown: providerBreakdown.items.map((i) => ({
        provider: i.name,
        amountCents: i.amountCents,
      })),
    };
  }

  private async loadBookingsForDate(companyId: string, date: string, branchId?: string | null) {
    let query = this.client
      .from("scheduling_bookings")
      .select(
        "id, status, branch_id, resource_id, service_id, start_at, end_at, scheduling_resources(name), branches(name), scheduling_services(price_cents)",
      )
      .eq("company_id", companyId)
      .gte("start_at", `${date}T00:00:00.000Z`)
      .lt("start_at", `${date}T23:59:59.999Z`)
      .is("deleted_at", null);

    if (branchId) query = query.eq("branch_id", branchId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => {
      const resource = row.scheduling_resources as { name?: string } | { name?: string }[] | null;
      const branch = row.branches as { name?: string } | { name?: string }[] | null;
      const service = row.scheduling_services as { price_cents?: number } | { price_cents?: number }[] | null;
      const resourceName = Array.isArray(resource) ? resource[0]?.name : resource?.name;
      const branchName = Array.isArray(branch) ? branch[0]?.name : branch?.name;
      const priceCents = Array.isArray(service) ? service[0]?.price_cents : service?.price_cents;

      return {
        id: String(row.id),
        status: String(row.status),
        branchId: row.branch_id ? String(row.branch_id) : null,
        resourceId: String(row.resource_id),
        resourceName: resourceName ?? "—",
        branchName: branchName ?? null,
        serviceId: String(row.service_id),
        startAt: String(row.start_at),
        endAt: String(row.end_at),
        priceCents: Number(priceCents ?? 0),
      };
    });
  }

  private async loadBranches(companyId: string) {
    const { data, error } = await this.client
      .from("branches")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("is_active", true);
    if (error) throw new Error(error.message);
    return (data ?? []).map((b) => ({ id: String(b.id), name: String(b.name) }));
  }

  private async loadCustomerStats(companyId: string) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { count: total } = await this.client
      .from("customers")
      .select("id", { count: "exact", head: true });

    const { count: newThisMonth } = await this.client
      .from("customers")
      .select("id", { count: "exact", head: true })
      .gte("created_at", monthStart.toISOString());

    const { data: repeatData } = await this.client
      .from("scheduling_bookings")
      .select("customer_id")
      .eq("company_id", companyId)
      .gte("created_at", monthStart.toISOString())
      .is("deleted_at", null);

    const customerCounts = new Map<string, number>();
    for (const row of repeatData ?? []) {
      const id = String(row.customer_id);
      customerCounts.set(id, (customerCounts.get(id) ?? 0) + 1);
    }
    const returning = [...customerCounts.values()].filter((c) => c > 1).length;

    return {
      total: total ?? 0,
      newThisMonth: newThisMonth ?? 0,
      returning,
    };
  }

  private async loadPaymentsToday(companyId: string, date: string) {
    const { data, error } = await this.client
      .from("customer_payments")
      .select("amount_cents")
      .eq("company_id", companyId)
      .eq("status", "completed")
      .gte("paid_at", `${date}T00:00:00.000Z`)
      .lt("paid_at", `${date}T23:59:59.999Z`);
    if (error) throw new Error(error.message);
    return (data ?? []).reduce((s, r) => s + Number(r.amount_cents), 0);
  }

  private async loadTaxCollected(companyId: string) {
    const { data, error } = await this.client
      .from("invoices")
      .select("tax_cents")
      .eq("company_id", companyId)
      .eq("invoice_type", "customer");
    if (error) throw new Error(error.message);
    return (data ?? []).reduce((s, r) => s + Number(r.tax_cents ?? 0), 0);
  }

  private async loadBookingsHistory(companyId: string, days: number) {
    const history: Array<{ date: string; count: number; revenueCents: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const bookings = await this.loadBookingsForDate(companyId, dateStr);
      history.push({
        date: dateStr,
        count: bookings.length,
        revenueCents: bookings.reduce((s, b) => s + b.priceCents, 0),
      });
    }
    return history;
  }

  async recordAccess(companyId: string, section = "dashboard"): Promise<void> {
    await this.client.rpc("executive_record_access", {
      p_company_id: companyId,
      p_section: section,
    });
  }
}
