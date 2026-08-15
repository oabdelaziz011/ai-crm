/**
 * Pure metric helpers for the Reports Center — real values only, no invented deltas.
 */
import { format } from "date-fns";
import type { Booking, Customer, Invoice } from "@/lib/types";
import type { ReportDefinition, ReportId } from "@/lib/reports/report-catalog";

export type ReportsCenterKpi = {
  id: string;
  labelKey: string;
  value: number;
  format: "currency" | "number" | "percent";
  icon: "revenue" | "customers" | "bookings" | "invoices" | "collection" | "leads";
  reportId?: ReportId;
  /** Mini sparkline from real monthly series when available */
  sparkline?: number[];
};

export type StatusSlice = { key: string; labelKey: string; value: number; color: string };

export function isSameMonth(iso: string | null | undefined, ref = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
}

export function buildBookingMonthSeries(bookings: Booking[]): Array<{ label: string; value: number }> {
  const points: Array<{ label: string; value: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const value = bookings.filter((booking) => {
      const bd = new Date(booking.booking_date);
      return bd.getMonth() === d.getMonth() && bd.getFullYear() === d.getFullYear();
    }).length;
    points.push({ label: format(d, "MMM"), value });
  }
  return points;
}

export function buildRevenueMonthSeries(invoices: Invoice[]): Array<{ label: string; value: number }> {
  const points: Array<{ label: string; value: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const value = invoices
      .filter((inv) => {
        if (inv.status !== "Paid") return false;
        const date = new Date(inv.invoice_date || inv.created_at);
        return date.getMonth() === d.getMonth() && date.getFullYear() === d.getFullYear();
      })
      .reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
    points.push({ label: format(d, "MMM"), value });
  }
  return points;
}

export function buildReportsCenterKpis(input: {
  available: ReportDefinition[];
  customers: Customer[];
  bookings: Booking[];
  invoices: Invoice[];
  leadsCount: number | null;
}): ReportsCenterKpi[] {
  const has = (id: ReportId) => input.available.some((r) => r.id === id);
  const kpis: ReportsCenterKpi[] = [];

  const paidRevenue = input.invoices
    .filter((inv) => inv.status === "Paid")
    .reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
  const billed = input.invoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
  const collectionRate = billed > 0 ? Math.round((paidRevenue / billed) * 100) : null;
  const customersThisMonth = input.customers.filter((c) => isSameMonth(c.created_at)).length;
  const revenueSpark = buildRevenueMonthSeries(input.invoices).map((p) => p.value);
  const bookingSpark = buildBookingMonthSeries(input.bookings).map((p) => p.value);

  if (has("invoices") || has("financial") || has("overview")) {
    kpis.push({
      id: "revenue",
      labelKey: "dashboard.reports.stats.revenue",
      value: paidRevenue,
      format: "currency",
      icon: "revenue",
      reportId: has("financial") ? "financial" : "invoices",
      sparkline: revenueSpark.some((v) => v > 0) ? revenueSpark : undefined,
    });
  }

  if (has("customers") || has("overview")) {
    kpis.push({
      id: "customers_month",
      labelKey: "dashboard.reports.center.kpis.newCustomers",
      value: customersThisMonth,
      format: "number",
      icon: "customers",
      reportId: "customers",
    });
  }

  if (has("bookings") || has("overview")) {
    kpis.push({
      id: "bookings",
      labelKey: "dashboard.reports.stats.bookings",
      value: input.bookings.length,
      format: "number",
      icon: "bookings",
      reportId: "bookings",
      sparkline: bookingSpark.some((v) => v > 0) ? bookingSpark : undefined,
    });
  }

  if (has("invoices") || has("overview")) {
    kpis.push({
      id: "invoices",
      labelKey: "dashboard.reports.stats.invoices",
      value: input.invoices.length,
      format: "number",
      icon: "invoices",
      reportId: "invoices",
    });
  }

  if ((has("invoices") || has("financial")) && collectionRate != null) {
    kpis.push({
      id: "collection",
      labelKey: "dashboard.reports.center.kpis.collectionRate",
      value: collectionRate,
      format: "percent",
      icon: "collection",
      reportId: has("financial") ? "financial" : "invoices",
    });
  }

  if (has("leads") && input.leadsCount != null) {
    kpis.push({
      id: "leads",
      labelKey: "dashboard.reports.catalog.leads",
      value: input.leadsCount,
      format: "number",
      icon: "leads",
      reportId: "leads",
    });
  }

  return kpis;
}

export function buildInvoiceStatusSlices(invoices: Invoice[]): StatusSlice[] {
  const paid = invoices.filter((i) => i.status === "Paid").length;
  const unpaid = invoices.filter((i) => i.status === "Unpaid").length;
  const overdue = invoices.filter((i) => i.status === "Overdue").length;
  return [
    { key: "paid", labelKey: "status.paid", value: paid, color: "hsl(152, 60%, 42%)" },
    { key: "unpaid", labelKey: "status.unpaid", value: unpaid, color: "hsl(38, 92%, 50%)" },
    { key: "overdue", labelKey: "status.overdue", value: overdue, color: "hsl(0, 72%, 55%)" },
  ];
}

export function buildBookingStatusSlices(bookings: Booking[]): StatusSlice[] {
  const confirmed = bookings.filter((b) => b.status === "Confirmed").length;
  const pending = bookings.filter((b) => b.status === "Pending").length;
  const cancelled = bookings.filter((b) => b.status === "Cancelled").length;
  return [
    { key: "confirmed", labelKey: "dashboard.reports.catalog.confirmed", value: confirmed, color: "hsl(190, 70%, 40%)" },
    { key: "pending", labelKey: "dashboard.reports.catalog.pending", value: pending, color: "hsl(38, 92%, 50%)" },
    { key: "cancelled", labelKey: "dashboard.reports.catalog.cancelled", value: cancelled, color: "hsl(0, 72%, 55%)" },
  ];
}

export function buildModuleMix(input: {
  available: ReportDefinition[];
  customers: number;
  bookings: number;
  invoices: number;
  leads: number;
}): StatusSlice[] {
  const slices: StatusSlice[] = [];
  if (input.available.some((r) => r.id === "customers")) {
    slices.push({
      key: "crm",
      labelKey: "dashboard.reports.categories.crm",
      value: input.customers,
      color: "hsl(190, 70%, 40%)",
    });
  }
  if (input.available.some((r) => r.id === "bookings")) {
    slices.push({
      key: "bookings",
      labelKey: "dashboard.reports.categories.bookings",
      value: input.bookings,
      color: "hsl(152, 60%, 42%)",
    });
  }
  if (input.available.some((r) => r.id === "invoices" || r.id === "financial")) {
    slices.push({
      key: "billing",
      labelKey: "dashboard.reports.categories.billing",
      value: input.invoices,
      color: "hsl(262, 52%, 55%)",
    });
  }
  if (input.available.some((r) => r.id === "leads")) {
    slices.push({
      key: "sales",
      labelKey: "dashboard.reports.categories.sales",
      value: input.leads,
      color: "hsl(24, 90%, 52%)",
    });
  }
  return slices.filter((s) => s.value > 0);
}
