import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCsvRecords, parseCustomerImportCsv } from "./parse-csv.js";

describe("customer import CSV parser", () => {
  it("parses quoted commas and newlines", () => {
    const rows = parseCsvRecords('name,notes\n"Ada, Lovelace","line1\nline2"\n');
    assert.equal(rows[1]?.[0], "Ada, Lovelace");
    assert.match(rows[1]?.[1] ?? "", /line1/);
  });

  it("strips UTF-8 BOM and builds workbook metadata", () => {
    const csv = "\uFEFFname,email\nSara,sara@example.com\n";
    const parsed = parseCustomerImportCsv({
      buffer: Buffer.from(csv, "utf8"),
      fileName: "customers.csv",
    });
    assert.equal(parsed.columns[0]?.header, "name");
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0]?.["0"], "Sara");
  });

  it("rejects UTF-16 BOM", () => {
    assert.throws(
      () =>
        parseCustomerImportCsv({
          buffer: Buffer.from([0xff, 0xfe, 0x41, 0x00]),
          fileName: "bad.csv",
        }),
      /UNSUPPORTED_ENCODING/,
    );
  });

  it("flags duplicate headers", () => {
    const parsed = parseCustomerImportCsv({
      buffer: Buffer.from("name,name\nA,\n"),
      fileName: "dup.csv",
    });
    assert.ok(parsed.warnings.some((warning) => warning.code === "duplicate_header"));
  });
});
