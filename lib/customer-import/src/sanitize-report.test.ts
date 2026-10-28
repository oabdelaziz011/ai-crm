import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildErrorReportCsv, sanitizeSpreadsheetCell } from "./sanitize-report.js";

describe("customer import error report sanitization", () => {
  it("neutralizes formula prefixes", () => {
    assert.equal(sanitizeSpreadsheetCell("=CMD()"), "'=CMD()");
    assert.equal(sanitizeSpreadsheetCell("+1"), "'+1");
  });

  it("builds a csv report", () => {
    const csv = buildErrorReportCsv([
      { rowNumber: 2, field: "email", code: "invalid_email", message: "bad", severity: "error" },
    ]);
    assert.match(csv, /row_number,field,error_code/);
    assert.match(csv, /2,email,invalid_email,error,bad/);
  });
});
