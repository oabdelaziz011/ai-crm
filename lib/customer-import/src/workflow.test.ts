import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCustomerImportTemplateBuffer,
  buildErrorReportCsv,
  buildExistingCustomerMatchIndex,
  buildValidationSummary,
  CUSTOMER_IMPORT_LIMITS,
  detectDuplicateCandidates,
  isExampleImportRow,
  parseCustomerImportCsv,
  parseCustomerImportXlsx,
  projectMappedRows,
  sanitizeSpreadsheetCell,
  suggestFieldMappings,
  validateMappedRows,
} from "./index.js";

describe("customer import workflow acceptance fixtures", () => {
  it("downloads a real template and filters EXAMPLE rows", async () => {
    const buffer = await buildCustomerImportTemplateBuffer();
    const parsed = await parseCustomerImportXlsx({
      buffer,
      fileName: "template.xlsx",
      sheetIndex: 0,
    });
    const mappings = suggestFieldMappings(parsed.columns);
    const projected = projectMappedRows(parsed, mappings).filter(
      (row) => !isExampleImportRow({ name: row.values.name ?? null }),
    );
    assert.equal(projected.length, 0);
  });

  it("parses valid CSV, maps, validates, and summarizes duplicates", () => {
    const csv = [
      "Client Name,Email Address,Mobile Number",
      "Sara Buyer,sara@example.com,+201011111111",
      "Omar Buyer,omar@example.com,+201022222222",
      "Sara Dup,sara@example.com,+201033333333",
      ",bad-email,",
    ].join("\n");
    const parsed = parseCustomerImportCsv({
      buffer: Buffer.from(csv, "utf8"),
      fileName: "customers.csv",
    });
    const mappings = suggestFieldMappings(parsed.columns);
    assert.equal(mappings[0]?.targetFieldId, "name");
    assert.equal(mappings[1]?.targetFieldId, "email");
    assert.equal(mappings[2]?.targetFieldId, "phone");

    const validated = validateMappedRows(projectMappedRows(parsed, mappings));
    assert.ok(validated[3]?.issues.some((issue) => issue.code === "name_required"));

    const duplicates = detectDuplicateCandidates(
      validated,
      buildExistingCustomerMatchIndex([
        { id: "existing-1", email: "omar@example.com", phone_e164: null },
      ]),
      "skip",
    );
    assert.ok(duplicates.some((dup) => dup.matchKind === "email" && dup.matchedValue === "omar@example.com"));
    assert.ok(duplicates.some((dup) => dup.matchKind === "file_internal"));

    const summary = buildValidationSummary(validated, duplicates, mappings);
    assert.equal(summary.totalRows, 4);
    assert.ok(summary.errorRows >= 1);
    assert.ok(summary.expectedSkips >= 1);
  });

  it("rejects oversized CSV and UTF-16", () => {
    assert.throws(
      () =>
        parseCustomerImportCsv({
          buffer: Buffer.alloc(CUSTOMER_IMPORT_LIMITS.maxFileBytes + 1),
          fileName: "big.csv",
        }),
      /FILE_TOO_LARGE/,
    );
    assert.throws(
      () =>
        parseCustomerImportCsv({
          buffer: Buffer.from([0xff, 0xfe, 0x41, 0x00]),
          fileName: "utf16.csv",
        }),
      /UNSUPPORTED_ENCODING/,
    );
  });

  it("sanitizes error-report formula cells", () => {
    assert.equal(sanitizeSpreadsheetCell("=1+1"), "'=1+1");
    const csv = buildErrorReportCsv([
      {
        rowNumber: 2,
        field: "email",
        code: "invalid_email",
        message: "=HYPERLINK(\"http://evil\")",
        severity: "error",
      },
    ]);
    assert.match(csv, /'=HYPERLINK/);
  });
});
