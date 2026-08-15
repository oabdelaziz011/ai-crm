import { downloadCsv } from "@/lib/billing/export-csv";
import type { Booking, Customer, Invoice } from "@/lib/types";
import type { ExecutiveReport } from "@/lib/executive/types";
import { exportExecutiveReportCsv } from "@/lib/executive/exports/csv-exporter";
import type { ReportId } from "@/lib/reports/report-catalog";

export type OverviewExportInput = {
  revenue: number;
  customers: number;
  bookings: number;
  invoices: number;
  branchLabel: string;
};

export function exportOverviewReportCsv(input: OverviewExportInput): void {
  downloadCsv(
    `report-overview-${new Date().toISOString().slice(0, 10)}.csv`,
    ["metric", "value", "branch"],
    [
      ["revenue", String(input.revenue), input.branchLabel],
      ["customers", String(input.customers), input.branchLabel],
      ["bookings", String(input.bookings), input.branchLabel],
      ["invoices", String(input.invoices), input.branchLabel],
    ],
  );
}

export function exportBookingsReportCsv(bookings: Booking[]): void {
  downloadCsv(
    `report-bookings-${new Date().toISOString().slice(0, 10)}.csv`,
    ["id", "date", "status", "customer_id", "location_id", "service"],
    bookings.map((b) => [
      b.id,
      b.booking_date ?? "",
      b.status ?? "",
      b.customer_id ?? "",
      b.location_id ?? "",
      b.service ?? "",
    ]),
  );
}

export function exportCustomersReportCsv(customers: Customer[]): void {
  downloadCsv(
    `report-customers-${new Date().toISOString().slice(0, 10)}.csv`,
    ["id", "name", "phone", "email", "created_at"],
    customers.map((c) => [
      c.id,
      c.name ?? "",
      c.phone ?? "",
      c.email ?? "",
      c.created_at ?? "",
    ]),
  );
}

export function exportInvoicesReportCsv(invoices: Invoice[]): void {
  downloadCsv(
    `report-invoices-${new Date().toISOString().slice(0, 10)}.csv`,
    ["id", "status", "amount", "customer_id", "invoice_date"],
    invoices.map((inv) => [
      inv.id,
      inv.status ?? "",
      String(inv.amount ?? ""),
      inv.customer_id ?? "",
      inv.invoice_date ?? inv.created_at ?? "",
    ]),
  );
}

export function exportLeadsReportCsv(
  leads: Array<{
    id: string;
    name?: string | null;
    status?: string | null;
    source?: string | null;
    created_at?: string | null;
  }>,
): void {
  downloadCsv(
    `report-leads-${new Date().toISOString().slice(0, 10)}.csv`,
    ["id", "name", "status", "source", "created_at"],
    leads.map((lead) => [
      lead.id,
      lead.name ?? "",
      lead.status ?? "",
      lead.source ?? "",
      lead.created_at ?? "",
    ]),
  );
}

export function exportReportById(
  reportId: ReportId,
  payload: {
    overview?: OverviewExportInput;
    bookings?: Booking[];
    customers?: Customer[];
    invoices?: Invoice[];
    leads?: Array<{
      id: string;
      name?: string | null;
      status?: string | null;
      source?: string | null;
      created_at?: string | null;
    }>;
    executive?: ExecutiveReport | null;
  },
): boolean {
  switch (reportId) {
    case "overview":
      if (!payload.overview) return false;
      exportOverviewReportCsv(payload.overview);
      return true;
    case "bookings":
    case "operations":
      exportBookingsReportCsv(payload.bookings ?? []);
      return true;
    case "customers":
      exportCustomersReportCsv(payload.customers ?? []);
      return true;
    case "invoices":
    case "financial":
      exportInvoicesReportCsv(payload.invoices ?? []);
      return true;
    case "leads":
      exportLeadsReportCsv(payload.leads ?? []);
      return true;
    case "executive":
      if (!payload.executive) return false;
      exportExecutiveReportCsv(payload.executive);
      return true;
    case "ai_consumption":
      if (!payload.overview) return false;
      exportOverviewReportCsv({
        ...payload.overview,
        branchLabel: `${payload.overview.branchLabel}|${reportId}`,
      });
      return true;
    case "companies":
    case "company_revenue":
    case "subscriptions":
    case "opportunities":
    case "products":
    case "quotes":
    case "tickets":
      if (!payload.overview) return false;
      exportOverviewReportCsv({
        ...payload.overview,
        branchLabel: `${payload.overview.branchLabel}|${reportId}`,
      });
      return true;
    default:
      return false;
  }
}
