import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("customer modal company field wiring", () => {
  it("renders and submits optional company_name on create/edit", () => {
    const source = readFileSync(join(here, "customer-modal.tsx"), "utf8");
    assert.match(source, /name="company_name"/);
    assert.match(source, /forms\.customer\.companyName/);
    assert.match(source, /company_name:\s*values\.company_name/);
    assert.match(source, /customer\?\.company_name/);
  });
});
