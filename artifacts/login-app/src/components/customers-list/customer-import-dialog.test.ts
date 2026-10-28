import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("customer import CRM UI wiring", () => {
  it("opens from the customers workspace instead of the coming-soon toast", () => {
    const workspace = readFileSync(join(here, "customers-list-workspace.tsx"), "utf8");
    assert.match(workspace, /CustomerImportDialog/);
    assert.match(workspace, /setImportOpen\(true\)/);
    assert.doesNotMatch(workspace, /importSoonDetail/);
  });

  it("implements the multi-stage import dialog", () => {
    const dialog = readFileSync(join(here, "customer-import-dialog.tsx"), "utf8");
    for (const token of [
      "downloadCustomerImportTemplate",
      "createCustomerImportJob",
      "saveCustomerImportMapping",
      "validateCustomerImportJob",
      "confirmCustomerImportJob",
      "downloadCustomerImportErrorReport",
      "customerImport.title",
      "company_name",
      "i18n.language",
      "customerImport.preview.examplesOnly",
      "customerImport.preview.issuesTitle",
      "fields.companyName.label",
    ]) {
      assert.match(dialog, new RegExp(token.replace(".", "\\.")));
    }
  });
});
