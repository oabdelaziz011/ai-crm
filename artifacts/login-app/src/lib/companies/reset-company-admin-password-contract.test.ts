import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  visibleCompanyRowActions,
  type CompanyRowActionCapabilities,
} from "./company-row-actions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const loginAppRoot = resolve(here, "../..");

function loadLocale(locale: string) {
  return JSON.parse(
    readFileSync(resolve(loginAppRoot, `locales/${locale}/common.json`), "utf8"),
  ) as {
    companies: {
      actions: { resetAdminPassword: string };
      resetAdminPassword: {
        title: string;
        sessionWarning: string;
        submit: string;
      };
      table: { email: string; loginEmail: string };
    };
  };
}

function baseCompany(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Disposable Co",
    status: "Active",
    approval_status: "approved",
    contact_email: "contact@example.com",
    tenant_provisioning_status: "ready",
    ...overrides,
  } as Parameters<typeof visibleCompanyRowActions>[0];
}

const superCaps: CompanyRowActionCapabilities = {
  canView: true,
  canEdit: true,
  canDelete: true,
  canCommercial: true,
  canViewBilling: true,
  canEditBilling: true,
  canResetAdminPassword: true,
};

const tenantAdminCaps: CompanyRowActionCapabilities = {
  ...superCaps,
  canResetAdminPassword: false,
};

describe("reset company admin password — UI contracts", () => {
  it("exposes Reset Admin Password only when canResetAdminPassword is true", () => {
    const withSuper = visibleCompanyRowActions(baseCompany(), superCaps).map((a) => a.id);
    const withTenant = visibleCompanyRowActions(baseCompany(), tenantAdminCaps).map((a) => a.id);

    assert.ok(withSuper.includes("resetAdminPassword"));
    assert.ok(!withTenant.includes("resetAdminPassword"));
  });

  it("localizes action + dialog strings in EN/AR", () => {
    const en = loadLocale("en");
    const ar = loadLocale("ar");

    assert.equal(en.companies.actions.resetAdminPassword, "Reset Admin Password");
    assert.equal(ar.companies.actions.resetAdminPassword, "إعادة تعيين كلمة مرور المسؤول");
    assert.equal(en.companies.resetAdminPassword.submit, "Reset Password");
    assert.equal(ar.companies.resetAdminPassword.submit, "إعادة تعيين كلمة المرور");
    assert.match(
      en.companies.resetAdminPassword.sessionWarning,
      /signed out of current sessions/i,
    );
    assert.match(ar.companies.resetAdminPassword.sessionWarning, /تسجيل خروج/);
    assert.equal(en.companies.table.loginEmail, "Login email");
    assert.equal(ar.companies.table.loginEmail, "بريد تسجيل الدخول");
    assert.equal(en.companies.table.email, "Contact email");
    assert.equal(ar.companies.table.email, "البريد الإلكتروني للتواصل");
  });

  it("dialog distinguishes contact email from login email and never stores password", () => {
    const dialog = readFileSync(
      resolve(loginAppRoot, "components/companies/reset-company-admin-password-dialog.tsx"),
      "utf8",
    );
    const resolveSrc = readFileSync(
      resolve(loginAppRoot, "lib/companies/resolve-company-admin-login.ts"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(loginAppRoot, "hooks/companies/use-reset-company-admin-password.ts"),
      "utf8",
    );

    assert.match(dialog, /companies\.table\.loginEmail/);
    assert.match(dialog, /companies\.table\.email/);
    assert.match(dialog, /contact_email/);
    assert.match(dialog, /submittingRef/);
    assert.match(dialog, /setPassword\(""\)/);
    assert.match(resolveSrc, /Never uses companies\.contact_email/);
    assert.doesNotMatch(resolveSrc, /\.from\(["']companies["']\)/);
    assert.match(resolveSrc, /template_key/);
    assert.match(resolveSrc, /['"]admin['"]/);
    assert.match(hook, /reset-company-admin-password/);
    assert.match(hook, /Never accept a password field/);
  });

  it("email values stay LTR via bdi without left-aligning the RTL field block", () => {
    const dialog = readFileSync(
      resolve(loginAppRoot, "components/companies/reset-company-admin-password-dialog.tsx"),
      "utf8",
    );

    assert.match(dialog, /<bdi dir="ltr">\{admin\?\.email/);
    assert.match(dialog, /<bdi dir="ltr">\{company\?\.contact_email/);
    assert.match(dialog, /text-start/);
    // Must not force the whole email value paragraph into an LTR block (pulls left in RTL).
    assert.doesNotMatch(
      dialog,
      /<p className="font-medium" dir="ltr">/,
    );
  });

  it("edge function never writes password into audit metadata and uses service-role auth admin", () => {
    const root = resolve(here, "../../../../../");
    const index = readFileSync(
      resolve(root, "supabase/functions/reset-company-admin-password/index.ts"),
      "utf8",
    );
    const audit = readFileSync(
      resolve(root, "supabase/functions/reset-company-admin-password/audit.ts"),
      "utf8",
    );

    assert.match(index, /is_super_admin/);
    assert.match(index, /updateUserById/);
    assert.match(index, /revokes existing refresh tokens/);
    assert.match(index, /resolveCompanyAdmin/);
    assert.match(index, /claimedAdminUserId/);
    assert.match(audit, /admin_password_reset/);
    assert.match(audit, /Intentionally NEVER includes password/);
    // metadata object must not assign password fields
    assert.doesNotMatch(audit, /password\s*:/);
    assert.doesNotMatch(audit, /newPassword|confirmPassword|password_hash/);
  });
});
