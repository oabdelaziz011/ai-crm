import ExcelJS from "exceljs";
import { CUSTOMER_IMPORT_LIMITS } from "./limits.js";
import type { ParsedImportWorkbook, ParsedWorksheet } from "./types.js";

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "object") {
    // Formula / rich text / hyperlink — use cached result only; never execute formulas.
    if ("result" in value && value.result != null) {
      return cellToString(value.result as ExcelJS.CellValue);
    }
    if ("text" in value && typeof (value as { text?: unknown }).text === "string") {
      return String((value as { text: string }).text).trim();
    }
    if ("richText" in value && Array.isArray((value as { richText: Array<{ text: string }> }).richText)) {
      return (value as { richText: Array<{ text: string }> }).richText.map((part) => part.text).join("").trim();
    }
  }
  return "";
}

export async function listXlsxWorksheets(buffer: Buffer): Promise<ParsedWorksheet[]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs reads the package; macros/external links are not executed.
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return workbook.worksheets.map((sheet, index) => ({
    name: sheet.name || `Sheet${index + 1}`,
    index,
    rowCount: Math.max(0, sheet.rowCount - 1),
  }));
}

export async function parseCustomerImportXlsx(input: {
  buffer: Buffer;
  fileName: string;
  sheetIndex?: number;
}): Promise<ParsedImportWorkbook> {
  if (input.buffer.byteLength > CUSTOMER_IMPORT_LIMITS.maxFileBytes) {
    throw new Error(
      `FILE_TOO_LARGE: Maximum file size is ${CUSTOMER_IMPORT_LIMITS.maxFileBytes} bytes.`,
    );
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(input.buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new Error("INVALID_XLSX: The workbook could not be read. Upload a valid .xlsx file.");
  }

  if (workbook.worksheets.length === 0) {
    throw new Error("EMPTY_WORKBOOK: The workbook has no worksheets.");
  }

  const worksheets = workbook.worksheets.map((sheet, index) => ({
    name: sheet.name || `Sheet${index + 1}`,
    index,
    rowCount: Math.max(0, sheet.rowCount - 1),
  }));

  const selectedSheetIndex = input.sheetIndex ?? 0;
  const sheet = workbook.worksheets[selectedSheetIndex];
  if (!sheet) {
    throw new Error("SHEET_NOT_FOUND: The selected worksheet does not exist.");
  }

  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      values[colNumber - 1] = cellToString(cell.value);
    });
    // Fill holes from sparse cells
    for (let i = 0; i < values.length; i += 1) {
      if (values[i] == null) values[i] = "";
    }
    if (values.some((cell) => cell.trim().length > 0)) {
      matrix.push(values.map((cell) => cell.trim()));
    }
  });

  if (matrix.length === 0) {
    throw new Error("EMPTY_SHEET: The selected worksheet has no rows.");
  }

  const headerRow = matrix[0]!;
  if (headerRow.length > CUSTOMER_IMPORT_LIMITS.maxHeaderColumns) {
    throw new Error(
      `TOO_MANY_COLUMNS: Maximum ${CUSTOMER_IMPORT_LIMITS.maxHeaderColumns} columns are supported.`,
    );
  }

  const warnings: Array<{ code: string; message: string }> = [];
  const seenHeaders = new Map<string, number>();
  const columns = headerRow.map((raw, index) => {
    const header = String(raw ?? "").trim() || `Column ${index + 1}`;
    const key = header.toLowerCase();
    if (seenHeaders.has(key)) {
      warnings.push({
        code: "duplicate_header",
        message: `Duplicate header "${header}" at column ${index + 1}.`,
      });
    }
    seenHeaders.set(key, index);
    return { index, header, samples: [] as string[] };
  });

  const dataRecords = matrix.slice(1);
  if (dataRecords.length > CUSTOMER_IMPORT_LIMITS.maxRows) {
    throw new Error(
      `TOO_MANY_ROWS: Maximum ${CUSTOMER_IMPORT_LIMITS.maxRows} data rows are supported in this release.`,
    );
  }

  const rows = dataRecords.map((record) => {
    const mapped: Record<string, string> = {};
    for (let i = 0; i < columns.length; i += 1) {
      mapped[String(i)] = String(record[i] ?? "").trim();
    }
    return mapped;
  });

  for (const column of columns) {
    for (const row of rows.slice(0, 5)) {
      const value = row[String(column.index)] ?? "";
      if (value) column.samples.push(value);
    }
  }

  return {
    sourceKind: "xlsx",
    fileName: input.fileName,
    fileSizeBytes: input.buffer.byteLength,
    worksheets,
    selectedSheetIndex,
    columns,
    rows,
    warnings,
  };
}
