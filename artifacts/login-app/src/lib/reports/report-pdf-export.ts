import { StubExecutivePdfExporter } from "@/lib/executive/exports/pdf-exporter";
import type { ExecutiveReport } from "@/lib/executive/types";
import type { OverviewExportInput } from "@/lib/reports/report-export";
import type { ReportId } from "@/lib/reports/report-catalog";
import type { Booking, Customer, Invoice } from "@/lib/types";

/** Downloadable report document (text/PDF mime). Swap renderer later without changing callers. */
export async function exportReportPdf(input: {
  reportId: ReportId;
  title: string;
  branchLabel: string;
  dateFrom: string | null;
  dateTo: string | null;
  overview?: OverviewExportInput;
  bookings?: Booking[];
  customers?: Customer[];
  invoices?: Invoice[];
  executive?: ExecutiveReport | null;
}): Promise<boolean> {
  if (input.executive) {
    const { blob } = await new StubExecutivePdfExporter().generate(input.executive);
    if (!blob) return false;
    triggerDownload(blob, `report-${input.reportId}.pdf`);
    return true;
  }

  const lines: string[] = [
    input.title,
    `Branch: ${input.branchLabel}`,
    `From: ${input.dateFrom ?? "—"}`,
    `To: ${input.dateTo ?? "—"}`,
    `Generated: ${new Date().toISOString()}`,
    "",
  ];

  if (input.overview) {
    lines.push("Overview");
    lines.push(`  Revenue: ${input.overview.revenue}`);
    lines.push(`  Customers: ${input.overview.customers}`);
    lines.push(`  Bookings: ${input.overview.bookings}`);
    lines.push(`  Invoices: ${input.overview.invoices}`);
    lines.push("");
  }
  if (input.bookings?.length) {
    lines.push(`Bookings (${input.bookings.length})`);
    for (const b of input.bookings.slice(0, 200)) {
      lines.push(`  ${b.booking_date} | ${b.status} | ${b.service}`);
    }
    lines.push("");
  }
  if (input.invoices?.length) {
    lines.push(`Invoices (${input.invoices.length})`);
    for (const inv of input.invoices.slice(0, 200)) {
      lines.push(`  ${inv.invoice_date} | ${inv.status} | ${inv.amount}`);
    }
    lines.push("");
  }
  if (input.customers?.length) {
    lines.push(`Customers (${input.customers.length})`);
    for (const c of input.customers.slice(0, 200)) {
      lines.push(`  ${c.name} | ${c.phone ?? ""} | ${c.created_at}`);
    }
  }

  const blob = new Blob([lines.join("\n")], { type: "application/pdf" });
  triggerDownload(blob, `report-${input.reportId}-${new Date().toISOString().slice(0, 10)}.pdf`);
  return true;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
