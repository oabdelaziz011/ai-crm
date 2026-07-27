import { downloadCsv } from "@/lib/billing/export-csv";
import { fmtCurrency, fmtDate } from "@/lib/customer-workspace/customer-workspace-utils";
import type { EnrichedCustomerRow } from "./types";

export function exportCustomersCsv(rows: EnrichedCustomerRow[], filename = "customers-export.csv"): void {
  const headers = [
    "Name",
    "Email",
    "Phone",
    "Company",
    "Status",
    "VIP",
    "Tags",
    "Outstanding",
    "LTV",
    "Next Appointment",
    "Last Activity",
    "Created",
  ];

  const data = rows.map((row) => [
    row.customer.name,
    row.customer.email ?? "",
    row.customer.phone ?? "",
    row.company ?? "",
    row.status,
    row.isVip ? "Yes" : "No",
    row.tags.join("; "),
    String(row.outstanding),
    String(row.ltv),
    row.nextAppointment ? fmtDate(row.nextAppointment.booking_date) : "",
    row.lastActivity ? fmtDate(row.lastActivity) : "",
    fmtDate(row.customer.created_at),
  ]);

  downloadCsv(filename, headers, data);
}

export function formatMoney(amount: number): string {
  return fmtCurrency(amount);
}
