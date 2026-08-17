import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(
  resolve(dir, "../src/pages/dashboard/email/email-templates-page.tsx"),
  "utf8",
);
const repo = readFileSync(
  resolve(dir, "../src/lib/email-templates/email-template-repository.ts"),
  "utf8",
);
const registry = readFileSync(resolve(dir, "../src/lib/notifications/providers/email/templates/email-template-registry.ts"), "utf8");

describe("email templates UI/module wiring (Sprint 1)", () => {
  it("page is no longer an empty stub and wires CRUD + preview", () => {
    assert.match(page, /useEmailTemplates/);
    assert.match(page, /useCreateEmailTemplate/);
    assert.match(page, /useDuplicateEmailTemplate/);
    assert.match(page, /renderEmailTemplate/);
    assert.match(page, /EMAIL_TEMPLATE_PREVIEW_CONTEXT/);
    assert.doesNotMatch(page, /No dedicated email template library/);
  });

  it("repository always scopes by company_id and never sends mail", () => {
    assert.match(repo, /\.eq\("company_id", companyId\)/);
    assert.match(repo, /company_id: companyId/);
    assert.doesNotMatch(repo, /smtp|transport\.send|testConnection/i);
  });

  it("leaves notification email template registry untouched", () => {
    assert.match(registry, /EMAIL_TEMPLATE_REGISTRY/);
    assert.match(registry, /appointment_created/);
  });
});
