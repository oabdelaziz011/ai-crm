import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestFieldMappings } from "./map-fields.js";
import { parseCustomerImportXlsx } from "./parse-xlsx.js";
import {
  buildCustomerImportTemplateBuffer,
  isExampleImportRow,
} from "./template.js";
import { getCustomerImportTemplateMessages } from "./template-i18n.js";

describe("customer import template", () => {
  it("builds an English workbook with localized headers and Instructions sheet", async () => {
    const messages = getCustomerImportTemplateMessages("en");
    const buffer = await buildCustomerImportTemplateBuffer({ locale: "en" });
    const parsed = await parseCustomerImportXlsx({
      buffer,
      fileName: "template.xlsx",
      sheetIndex: 0,
    });
    assert.ok(parsed.columns.some((column) => column.header === messages.fieldHeaders.name));
    assert.ok(parsed.columns.some((column) => column.header === messages.fieldHeaders.company_name));
    assert.ok(parsed.rows.every((row) => String(row["0"] ?? "").startsWith("EXAMPLE")));
    assert.equal(isExampleImportRow({ name: "EXAMPLE — Sara" }), true);

    const mappings = suggestFieldMappings(parsed.columns);
    assert.equal(
      mappings.find((entry) => entry.sourceHeader === messages.fieldHeaders.company_name)
        ?.targetFieldId,
      "company_name",
    );
  });

  it("builds an Arabic workbook with Arabic headers that still map to canonical fields", async () => {
    const messages = getCustomerImportTemplateMessages("ar");
    const buffer = await buildCustomerImportTemplateBuffer({ locale: "ar" });
    const parsed = await parseCustomerImportXlsx({
      buffer,
      fileName: "template-ar.xlsx",
      sheetIndex: 0,
    });
    assert.ok(parsed.columns.some((column) => column.header === messages.fieldHeaders.name));
    assert.ok(parsed.columns.some((column) => column.header === messages.fieldHeaders.company_name));
    assert.ok(parsed.rows.every((row) => String(row["0"] ?? "").startsWith("مثال")));

    const mappings = suggestFieldMappings(parsed.columns);
    assert.equal(
      mappings.find((entry) => entry.sourceHeader === messages.fieldHeaders.name)?.targetFieldId,
      "name",
    );
    assert.equal(
      mappings.find((entry) => entry.sourceHeader === messages.fieldHeaders.company_name)
        ?.targetFieldId,
      "company_name",
    );
    assert.equal(isExampleImportRow({ name: messages.exampleNameSara }), true);
    assert.equal(isExampleImportRow({ name: "محمد علي" }), false);
  });
});
