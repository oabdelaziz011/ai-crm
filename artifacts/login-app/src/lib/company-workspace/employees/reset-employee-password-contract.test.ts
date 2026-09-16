import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const loginAppSrc = resolve(here, "../../..");
const repoRoot = resolve(loginAppSrc, "../../..");

function loadLocale(locale: string) {
  return JSON.parse(
    readFileSync(resolve(loginAppSrc, `locales/${locale}/common.json`), "utf8"),
  ) as {
    companyWorkspace: {
      employees: {
        actions: { resetPassword: string };
        resetPassword: {
          title: string;
          submit: string;
          sessionWarning: string;
          loginEmail: string;
          errors: { unauthorized: string };
        };
        toasts: {
          resetPasswordTitle: string;
          resetPasswordDescription: string;
        };
      };
    };
  };
}

describe("reset employee password — UI contracts", () => {
  it("localizes dialog + success as a direct password set, not an email link", () => {
    const en = loadLocale("en");
    const ar = loadLocale("ar");

    assert.equal(en.companyWorkspace.employees.actions.resetPassword, "Reset password");
    assert.equal(ar.companyWorkspace.employees.actions.resetPassword, "إعادة تعيين كلمة المرور");
    assert.equal(en.companyWorkspace.employees.resetPassword.submit, "Reset password");
    assert.equal(ar.companyWorkspace.employees.resetPassword.submit, "إعادة تعيين كلمة المرور");
    assert.equal(en.companyWorkspace.employees.toasts.resetPasswordTitle, "Password updated");
    assert.equal(ar.companyWorkspace.employees.toasts.resetPasswordTitle, "تم تحديث كلمة المرور");
    assert.match(en.companyWorkspace.employees.toasts.resetPasswordDescription, /sign in with the new password/i);
    assert.match(ar.companyWorkspace.employees.toasts.resetPasswordDescription, /كلمة المرور الجديدة/);
    assert.doesNotMatch(en.companyWorkspace.employees.toasts.resetPasswordTitle, /email|sent|link/i);
    assert.doesNotMatch(ar.companyWorkspace.employees.toasts.resetPasswordTitle, /إرسال|رابط|بريد/);
    assert.match(en.companyWorkspace.employees.resetPassword.sessionWarning, /signed out of current sessions/i);
    assert.match(ar.companyWorkspace.employees.resetPassword.sessionWarning, /تسجيل خروج/);
    assert.equal(en.companyWorkspace.employees.resetPassword.loginEmail, "Login email");
    assert.equal(ar.companyWorkspace.employees.resetPassword.loginEmail, "بريد تسجيل الدخول");
  });

  it("admin/manager surfaces open the dialog and never call resetPasswordForEmail", () => {
    const employeesTab = readFileSync(
      resolve(loginAppSrc, "components/company-workspace/tabs/company-employees-tab.tsx"),
      "utf8",
    );
    const usersPage = readFileSync(resolve(loginAppSrc, "pages/users.tsx"), "utf8");
    const dialog = readFileSync(
      resolve(loginAppSrc, "components/company-workspace/employees/reset-employee-password-dialog.tsx"),
      "utf8",
    );
    const hook = readFileSync(resolve(loginAppSrc, "hooks/users/use-reset-employee-password.ts"), "utf8");

    assert.match(employeesTab, /ResetEmployeePasswordDialog/);
    assert.match(employeesTab, /setResetUser\(user\)/);
    assert.doesNotMatch(employeesTab, /useResetManagedUserPassword/);
    assert.doesNotMatch(employeesTab, /resetPasswordForEmail/);

    assert.match(usersPage, /ResetEmployeePasswordDialog/);
    assert.match(usersPage, /setResetUser\(user\)/);
    assert.doesNotMatch(usersPage, /useResetManagedUserPassword/);
    assert.doesNotMatch(usersPage, /resetPasswordForEmail/);

    assert.match(dialog, /useResetEmployeePassword/);
    assert.match(dialog, /submittingRef/);
    assert.match(dialog, /setPassword\(""\)/);
    assert.match(dialog, /<bdi dir="ltr">\{user\?\.email/);
    assert.match(hook, /reset-employee-password/);
    assert.match(hook, /Never accept a password field/);
  });

  it("edge function sets the password server-side with RBAC and never audits secrets", () => {
    const index = readFileSync(resolve(repoRoot, "supabase/functions/reset-employee-password/index.ts"), "utf8");
    const audit = readFileSync(resolve(repoRoot, "supabase/functions/reset-employee-password/audit.ts"), "utf8");

    assert.match(index, /updateUserById/);
    assert.match(index, /employees\.manage/);
    assert.match(index, /users\.edit/);
    assert.match(index, /authorizeEmployeePasswordReset/);
    assert.match(index, /Response must NEVER include the password/);
    assert.match(audit, /employee_password_reset/);
    assert.match(audit, /Intentionally NEVER includes password/);
    assert.doesNotMatch(audit, /newPassword|confirmPassword|password_hash/);
  });
});
