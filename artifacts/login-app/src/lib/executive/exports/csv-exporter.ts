import { downloadCsv } from "@/lib/billing/export-csv";
import type { ExecutiveReport } from "@/lib/executive/types";

export function exportExecutiveReportCsv(report: ExecutiveReport): void {
  const headers = ["section", "metric", "value"];
  const rows: string[][] = [];
  for (const section of report.sections) {
    for (const [metric, value] of Object.entries(section.metrics)) {
      rows.push([section.heading, metric, String(value)]);
    }
  }
  downloadCsv(`executive-${report.kind}-${report.period}.csv`, headers, rows);
}
