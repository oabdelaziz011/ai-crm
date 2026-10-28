/** Neutralize spreadsheet formula injection in exported error reports. */
export function sanitizeSpreadsheetCell(value: unknown): string {
  const text = String(value ?? "");
  if (/^[=+\-@]/.test(text) || text.startsWith("\t")) {
    return `'${text}`;
  }
  return text;
}

export function buildErrorReportCsv(
  rows: Array<{
    rowNumber: number;
    field: string | null;
    code: string;
    message: string;
    severity: string;
  }>,
): string {
  const header = ["row_number", "field", "error_code", "severity", "message"];
  const lines = [header.join(",")];
  for (const row of rows) {
    const cells = [
      String(row.rowNumber),
      sanitizeSpreadsheetCell(row.field ?? ""),
      sanitizeSpreadsheetCell(row.code),
      sanitizeSpreadsheetCell(row.severity),
      sanitizeSpreadsheetCell(row.message),
    ].map((cell) => {
      if (/[",\n\r]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
      return cell;
    });
    lines.push(cells.join(","));
  }
  return `${lines.join("\n")}\n`;
}
