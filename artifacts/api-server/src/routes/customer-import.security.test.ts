import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, "customer-import.ts"), "utf8");
const indexSource = readFileSync(join(here, "index.ts"), "utf8");

describe("customer import API security wiring", () => {
  it("mounts the import router and requires supabase auth", () => {
    assert.match(indexSource, /customer-import/);
    assert.match(routeSource, /requireSupabaseAuth/);
    assert.match(routeSource, /customers\.import/);
    assert.match(routeSource, /customers\.create/);
    assert.match(routeSource, /confirmed/);
    assert.doesNotMatch(routeSource, /company_id\s*=\s*req\.body\.companyId/);
  });

  it("exposes template, jobs, validate, confirm, cancel, and error-report routes", () => {
    for (const path of [
      "/customers/import/template",
      "/customers/import/jobs",
      "/customers/import/jobs/:jobId/mapping",
      "/customers/import/jobs/:jobId/validate",
      "/customers/import/jobs/:jobId/confirm",
      "/customers/import/jobs/:jobId/cancel",
      "/customers/import/jobs/:jobId/error-report",
    ]) {
      assert.match(routeSource, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(routeSource, /router\.post\(\s*"\/customers\/import\/jobs\/:jobId\/mapping"/);
    assert.doesNotMatch(routeSource, /router\.put\(\s*"\/customers\/import\/jobs\/:jobId\/mapping"/);
  });

  it("resolves template locale from query or Accept-Language", () => {
    assert.match(routeSource, /resolveTemplateLocale|query\.locale/);
    assert.match(routeSource, /accept-language/i);
    assert.match(routeSource, /resolveCustomerImportLocale/);
  });
});
