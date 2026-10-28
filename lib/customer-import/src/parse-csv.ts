import { CUSTOMER_IMPORT_LIMITS } from "./limits.js";
import type { ParsedImportWorkbook } from "./types.js";

function decodeCsvBuffer(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString("utf8");
  }
  // Reject UTF-16 BOM — unsupported encodings must fail clearly.
  if (buffer.length >= 2 && ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff))) {
    throw new Error("UNSUPPORTED_ENCODING: Save the CSV as UTF-8 and try again.");
  }
  return buffer.toString("utf8");
}

/** Minimal RFC4180 CSV parser (quoted fields, commas, newlines). */
export function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (ch === "\r") {
      continue;
    }
    field += ch;
  }

  if (inQuotes) {
    throw new Error("MALFORMED_CSV: Unterminated quoted field.");
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((cell) => cell.trim().length > 0));
}

export function parseCustomerImportCsv(input: {
  buffer: Buffer;
  fileName: string;
}): ParsedImportWorkbook {
  if (input.buffer.byteLength > CUSTOMER_IMPORT_LIMITS.maxFileBytes) {
    throw new Error(
      `FILE_TOO_LARGE: Maximum file size is ${CUSTOMER_IMPORT_LIMITS.maxFileBytes} bytes.`,
    );
  }

  const text = decodeCsvBuffer(input.buffer);
  const records = parseCsvRecords(text);
  if (records.length === 0) {
    throw new Error("EMPTY_FILE: The CSV file has no rows.");
  }

  const headerRow = records[0]!;
  if (headerRow.length > CUSTOMER_IMPORT_LIMITS.maxHeaderColumns) {
    throw new Error(
      `TOO_MANY_COLUMNS: Maximum ${CUSTOMER_IMPORT_LIMITS.maxHeaderColumns} columns are supported.`,
    );
  }

  const warnings: Array<{ code: string; message: string }> = [];
  const seenHeaders = new Map<string, number>();
  const columns = headerRow.map((raw, index) => {
    const header = String(raw ?? "").replace(/^\uFEFF/, "").trim() || `Column ${index + 1}`;
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

  const dataRecords = records.slice(1);
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
    sourceKind: "csv",
    fileName: input.fileName,
    fileSizeBytes: input.buffer.byteLength,
    worksheets: [{ name: "Sheet1", index: 0, rowCount: rows.length }],
    selectedSheetIndex: 0,
    columns,
    rows,
    warnings,
  };
}
