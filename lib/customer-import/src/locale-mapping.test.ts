import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCustomerImportTemplateBuffer,
  isExampleImportRow,
  projectMappedRows,
  suggestFieldMappings,
  validateMappedRows,
} from "./index.js";
import { parseCustomerImportCsv } from "./parse-csv.js";
import { parseCustomerImportXlsx } from "./parse-xlsx.js";
import { getCustomerImportTemplateMessages } from "./template-i18n.js";

describe("customer import localized headers", () => {
  it("maps English template headers while Arabic UI locale is active conceptually", async () => {
    const enMessages = getCustomerImportTemplateMessages("en");
    const buffer = await buildCustomerImportTemplateBuffer({ locale: "en" });
    const parsed = await parseCustomerImportXlsx({
      buffer,
      fileName: "en.xlsx",
      sheetIndex: 0,
    });
    const mappings = suggestFieldMappings(parsed.columns);
    const projected = projectMappedRows(parsed, mappings).filter(
      (row) => !isExampleImportRow({ name: row.values.name ?? null }),
    );
    assert.equal(projected.length, 0);
    assert.ok(
      mappings.some(
        (entry) =>
          entry.sourceHeader === enMessages.fieldHeaders.company_name &&
          entry.targetFieldId === "company_name",
      ),
    );
  });

  it("maps Arabic template headers while English UI locale is active conceptually", async () => {
    const arMessages = getCustomerImportTemplateMessages("ar");
    const buffer = await buildCustomerImportTemplateBuffer({ locale: "ar" });
    const parsed = await parseCustomerImportXlsx({
      buffer,
      fileName: "ar.xlsx",
      sheetIndex: 0,
    });
    const mappings = suggestFieldMappings(parsed.columns);
    const projected = projectMappedRows(parsed, mappings).filter(
      (row) => !isExampleImportRow({ name: row.values.name ?? null }),
    );
    assert.equal(projected.length, 0);
    assert.ok(
      mappings.some(
        (entry) =>
          entry.sourceHeader === arMessages.fieldHeaders.name && entry.targetFieldId === "name",
      ),
    );
  });

  it("maps Company / Organization / Account Name aliases and validates company_name", () => {
    const csv = [
      "Client Name,Organization,Email Address",
      "Sara Buyer,Acme Corp,sara@example.com",
      "Omar Buyer,,omar@example.com",
    ].join("\n");
    const parsed = parseCustomerImportCsv({
      buffer: Buffer.from(csv, "utf8"),
      fileName: "org.csv",
    });
    const mappings = suggestFieldMappings(parsed.columns);
    assert.equal(mappings[0]?.targetFieldId, "name");
    assert.equal(mappings[1]?.targetFieldId, "company_name");
    assert.equal(mappings[2]?.targetFieldId, "email");

    const validated = validateMappedRows(projectMappedRows(parsed, mappings));
    assert.equal(validated[0]?.values.company_name, "Acme Corp");
    assert.equal(validated[1]?.values.company_name, undefined);
  });

  it("maps Arabic شركة header to company_name", () => {
    const csv = ["اسم العميل,الشركة\nنورة,مؤسسة النور"].join("\n");
    const parsed = parseCustomerImportCsv({
      buffer: Buffer.from(csv, "utf8"),
      fileName: "ar-org.csv",
    });
    const mappings = suggestFieldMappings(parsed.columns);
    assert.equal(mappings[0]?.targetFieldId, "name");
    assert.equal(mappings[1]?.targetFieldId, "company_name");
    const validated = validateMappedRows(projectMappedRows(parsed, mappings));
    assert.equal(validated[0]?.values.company_name, "مؤسسة النور");
  });
});
