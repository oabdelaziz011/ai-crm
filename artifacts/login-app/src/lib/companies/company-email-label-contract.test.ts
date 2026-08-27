import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const loginAppRoot = resolve(here, "../../..");

function loadLocale(locale: string) {
  const path = resolve(loginAppRoot, `src/locales/${locale}/common.json`);
  return JSON.parse(readFileSync(path, "utf8")) as {
    companies: {
      table: { email: string; loginEmail: string };
      approval: { wizard: { adminAccess: { loginEmail: string } } };
    };
    companyOnboarding: {
      fields: { contactEmail: string; ownerEmail: string };
    };
  };
}

describe("company contact vs login email labels", () => {
  it("labels companies.contact_email as Contact email / البريد الإلكتروني للتواصل", () => {
    const en = loadLocale("en");
    const ar = loadLocale("ar");

    assert.equal(en.companies.table.email, "Contact email");
    assert.equal(ar.companies.table.email, "البريد الإلكتروني للتواصل");

    assert.equal(en.companyOnboarding.fields.contactEmail, "Contact email");
    assert.equal(ar.companyOnboarding.fields.contactEmail, "البريد الإلكتروني للتواصل");
  });

  it("labels owner/login email explicitly when that concept is shown", () => {
    const en = loadLocale("en");
    const ar = loadLocale("ar");

    assert.equal(en.companies.table.loginEmail, "Login email");
    assert.equal(ar.companies.table.loginEmail, "بريد تسجيل الدخول");
    assert.equal(en.companies.approval.wizard.adminAccess.loginEmail, "Login email");
    assert.equal(ar.companies.approval.wizard.adminAccess.loginEmail, "بريد تسجيل الدخول");
    assert.equal(en.companyOnboarding.fields.ownerEmail, "Login email");
    assert.equal(ar.companyOnboarding.fields.ownerEmail, "بريد تسجيل الدخول");
  });

  it("Companies list/details/review bind contact_email to companies.table.email only", () => {
    const files = [
      "src/pages/companies.tsx",
      "src/components/companies/details/company-details-workspace.tsx",
      "src/components/companies/approval/company-approval-workspace.tsx",
    ];

    for (const relative of files) {
      const source = readFileSync(resolve(loginAppRoot, relative), "utf8");
      assert.match(
        source,
        /contact_email/,
        `${relative} should still render company.contact_email`,
      );
      assert.match(
        source,
        /t\(["']companies\.table\.email["']\)/,
        `${relative} should label contact_email via companies.table.email`,
      );
      assert.doesNotMatch(
        source,
        /auth\.users|signInWithPassword|resetPassword|inviteUserByEmail/,
        `${relative} must not introduce auth logic for this label fix`,
      );
    }
  });

  it("admin access panel labels existing owner.email as login email without new auth queries", () => {
    const source = readFileSync(
      resolve(
        loginAppRoot,
        "src/components/companies/approval/company-approval-admin-access-panel.tsx",
      ),
      "utf8",
    );

    assert.match(source, /owner\.email/);
    assert.match(
      source,
      /companies\.approval\.wizard\.adminAccess\.loginEmail/,
    );
    assert.doesNotMatch(
      source,
      /auth\.admin|from\(["']auth\.users["']\)|signInWithPassword|createUser/,
    );
    assert.match(source, /useCompanyReviewAdminAccess/);
  });
});
