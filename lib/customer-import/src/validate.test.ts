import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { projectMappedRows, validateMappedRows } from "./validate.js";
import type { FieldMappingEntry, ParsedImportWorkbook } from "./types.js";

const workbook: ParsedImportWorkbook = {
  sourceKind: "csv",
  fileName: "t.csv",
  fileSizeBytes: 10,
  worksheets: [{ name: "Sheet1", index: 0, rowCount: 2 }],
  selectedSheetIndex: 0,
  columns: [
    { index: 0, header: "name", samples: [] },
    { index: 1, header: "email", samples: [] },
    { index: 2, header: "phone", samples: [] },
  ],
  rows: [
    { "0": "Sara", "1": "bad-email", "2": "+201000000001" },
    { "0": "", "1": "ok@example.com", "2": "" },
  ],
  warnings: [],
};

const mappings: FieldMappingEntry[] = [
  { sourceColumnIndex: 0, sourceHeader: "name", targetFieldId: "name", ignored: false, confidence: "exact" },
  { sourceColumnIndex: 1, sourceHeader: "email", targetFieldId: "email", ignored: false, confidence: "exact" },
  { sourceColumnIndex: 2, sourceHeader: "phone", targetFieldId: "phone", ignored: false, confidence: "exact" },
];

describe("customer import validation", () => {
  it("reports invalid email and missing name", () => {
    const projected = projectMappedRows(workbook, mappings);
    const validated = validateMappedRows(projected);
    assert.ok(validated[0]?.issues.some((issue) => issue.code === "invalid_email"));
    assert.ok(validated[1]?.issues.some((issue) => issue.code === "name_required"));
  });
});
