/**
 * Roles UI taxonomy — presentation grouping only.
 * Run: pnpm exec tsx --test src/lib/rbac/permission-module-taxonomy.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  EMAIL_MODULE_PERMISSION_CODES,
  EMAIL_WORKSPACE_PERMISSION_CODES,
  countSelectedInCodes,
  filterPermissionsBySearch,
  groupPermissionsForRoleEditor,
  overlayPermissionModuleId,
  resolvePermissionFamilyId,
} from "./permission-module-taxonomy.ts";
import { addPermissionCodes, removePermissionCodes, togglePermissionCode } from "./permission-selection.ts";
import {
  buildEmployeeRoleOptions,
  isHardcodedRoleNameList,
} from "./employee-role-options.ts";

const here = dirname(fileURLToPath(import.meta.url));
const enCatalog = JSON.parse(
  readFileSync(join(here, "../../locales/en/permission-catalog.json"), "utf8"),
) as { groups: Record<string, { label: string }>; codes: Record<string, { name: string; description: string; group: string }> };
const arCatalog = JSON.parse(
  readFileSync(join(here, "../../locales/ar/permission-catalog.json"), "utf8"),
) as { groups: Record<string, { label: string }>; codes: Record<string, { name: string; description: string; group: string }> };
const enCommon = JSON.parse(readFileSync(join(here, "../../locales/en/common.json"), "utf8")) as {
  roles: { families: Record<string, string>; permissions: Record<string, string> };
};
const arCommon = JSON.parse(readFileSync(join(here, "../../locales/ar/common.json"), "utf8")) as {
  roles: { families: Record<string, string>; permissions: Record<string, string> };
};

function rec(code: string) {
  return { id: code, code };
}

describe("permission module taxonomy", () => {
  it("keeps Email Workspace canonical codes under email without renaming them", () => {
    for (const code of EMAIL_WORKSPACE_PERMISSION_CODES) {
      assert.equal(overlayPermissionModuleId(code), "email", code);
      assert.equal(resolvePermissionFamilyId("email"), "aiPlatform");
    }
    assert.deepEqual([...EMAIL_WORKSPACE_PERMISSION_CODES], [
      "ai.conversations.view",
      "ai.conversations.view_assigned",
      "ai.conversations.reply",
      "ai.conversations.takeover",
      "ai.conversations.release",
    ]);
  });

  it("does not dump shared channels.view into Email", () => {
    assert.equal(overlayPermissionModuleId("channels.view"), null);
    assert.equal(enCatalog.codes["channels.view"].group, "channels");
  });

  it("groups Email first under AI Platform", () => {
    const grouped = groupPermissionsForRoleEditor(
      [
        rec("customers.view"),
        rec("ai.conversations.view"),
        rec("channels.view"),
        rec("prompts.view"),
        rec("knowledge.view"),
      ],
      (code) => overlayPermissionModuleId(code) ?? enCatalog.codes[code]?.group ?? "aiPlatform",
    );
    assert.equal(grouped[0].familyId, "aiPlatform");
    assert.equal(grouped[0].modules[0].moduleId, "email");
    assert.ok(grouped[0].modules.some((module) => module.moduleId === "prompts"));
    assert.ok(grouped.some((family) => family.familyId === "crm"));
  });

  it("search keeps module context and matches EN/AR/code", () => {
    const haystack = (code: string) =>
      [
        code,
        enCatalog.codes[code]?.name,
        arCatalog.codes[code]?.name,
        enCatalog.codes[code]?.description,
        arCatalog.codes[code]?.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    const rows = [
      rec("ai.conversations.view"),
      rec("ai.conversations.view_assigned"),
      rec("customers.view"),
    ];
    const byArabic = filterPermissionsBySearch(rows, "عرض جميع المحادثات", haystack);
    assert.equal(byArabic.length, 1);
    assert.equal(byArabic[0].code, "ai.conversations.view");

    const byCode = filterPermissionsBySearch(rows, "ai.conversations.view_assigned", haystack);
    assert.equal(byCode.length, 1);
    assert.equal(byCode[0].code, "ai.conversations.view_assigned");

    const byEnglish = filterPermissionsBySearch(rows, "view all conversations", haystack);
    assert.equal(byEnglish[0].code, "ai.conversations.view");
  });

  it("select-all / clear-all only touch provided active codes", () => {
    const available = ["ai.conversations.view", "channels.view"];
    const selected = addPermissionCodes(["legacy.obsolete"], available);
    assert.deepEqual(selected.sort(), ["ai.conversations.view", "channels.view", "legacy.obsolete"].sort());
    const cleared = removePermissionCodes(selected, available);
    assert.deepEqual(cleared, ["legacy.obsolete"]);
    const toggled = togglePermissionCode(["channels.view"], "channels.view");
    assert.deepEqual(toggled, []);
    const counts = countSelectedInCodes(["channels.view"], available);
    assert.equal(counts.selected, 1);
    assert.equal(counts.partial, true);
  });
});

describe("Roles & Permissions translations", () => {
  const requiredPermissionKeys = [
    "title",
    "selectAll",
    "clearAll",
    "expandAll",
    "collapseAll",
    "searchPlaceholder",
    "selectedCounter",
    "groupCounter",
    "familyCounter",
    "moduleSelectAll",
    "moduleClear",
    "noResults",
  ];

  it("has professional EN/AR family and permission chrome strings (no raw keys)", () => {
    for (const key of requiredPermissionKeys) {
      assert.equal(typeof enCommon.roles.permissions[key], "string", `en ${key}`);
      assert.equal(typeof arCommon.roles.permissions[key], "string", `ar ${key}`);
      assert.doesNotMatch(enCommon.roles.permissions[key], /^roles\./);
      assert.doesNotMatch(arCommon.roles.permissions[key], /^roles\./);
    }
    for (const family of ["aiPlatform", "crm", "company", "finance", "operations"]) {
      assert.ok(enCommon.roles.families[family], `en family ${family}`);
      assert.ok(arCommon.roles.families[family], `ar family ${family}`);
      assert.match(arCommon.roles.families[family], /[^\x00-\x7F]/);
    }
    assert.match(arCommon.roles.families.aiPlatform, /منصة الذكاء الاصطناعي/);
    assert.equal(enCatalog.groups.email.label, "Email");
    assert.equal(arCatalog.groups.email.label, "البريد الإلكتروني");
    assert.equal(arCatalog.groups.prompts.label, "قوالب مطالبات الذكاء الاصطناعي");
  });

  it("keeps permission codes in English in the catalog", () => {
    for (const code of EMAIL_MODULE_PERMISSION_CODES) {
      if (!enCatalog.codes[code]) continue;
      assert.match(code, /^[a-z0-9._]+$/);
    }
    assert.equal(enCatalog.codes["ai.conversations.view"].name, "View All Conversations");
    assert.equal(arCatalog.codes["ai.conversations.view"].name, "عرض جميع المحادثات");
    assert.equal(arCatalog.codes["ai.conversations.takeover"].name, "إسناد المحادثات يدوياً");
    assert.equal(arCatalog.codes["ai.conversations.release"].name, "إلغاء إسناد المحادثات");
    assert.match(enCatalog.codes["email.view"].description, /Open Email Workspace/i);
    assert.match(enCatalog.codes["email.run"].description, /Does not open Email Workspace/i);
    assert.match(arCatalog.codes["email.view"].description, /فتح مساحة البريد الإلكتروني/);
    assert.match(arCatalog.codes["email.run"].description, /لا تفتح مساحة البريد الإلكتروني/);
    assert.equal(enCatalog.codes["email.templates.view"].name, "View Email Templates");
    assert.equal(arCatalog.codes["email.templates.view"].name, "عرض قوالب البريد الإلكتروني");
    assert.equal(enCatalog.codes["email.routing.view"].name, "View Email AI Routing");
    assert.equal(arCatalog.codes["email.routing.view"].name, "عرض توجيه البريد بالذكاء الاصطناعي");
    assert.equal(enCatalog.codes["ai.email.manage"].name, "Manage Email Settings");
    assert.equal(arCatalog.codes["ai.email.manage"].name, "إدارة إعدادات البريد الإلكتروني");
    assert.match(enCatalog.codes["ai.email.manage"].description, /Email Workspace Settings tab/i);
    assert.equal(enCatalog.codes["email.settings.manage"].name, "Manage Email Connection");
    assert.equal(arCatalog.codes["email.settings.manage"].name, "إدارة اتصال البريد");
    assert.equal(enCatalog.codes["email.identity.manage"].name, "Manage Personal Email Identity");
    assert.equal(arCatalog.codes["email.identity.manage"].name, "إدارة الهوية البريدية الشخصية");
    assert.equal(
      enCatalog.codes["email.identity.company.manage"].name,
      "Manage Company Email Identity",
    );
    assert.equal(arCatalog.codes["email.identity.company.manage"].name, "إدارة هوية بريد الشركة");
    assert.equal(enCatalog.codes["email.templates.view"].group, "email");
    assert.equal(enCatalog.codes["email.routing.view"].group, "email");
    assert.equal(enCatalog.codes["ai.email.manage"].group, "email");
    assert.equal(enCatalog.codes["email.settings.manage"].group, "email");
    assert.equal(enCatalog.codes["email.identity.manage"].group, "email");
    assert.equal(enCatalog.codes["email.identity.company.manage"].group, "email");
    for (const code of [
      "email.settings.manage",
      "email.identity.manage",
      "email.identity.company.manage",
      "ai.email.manage",
    ]) {
      assert.equal(overlayPermissionModuleId(code), "email", code);
    }
  });
});

describe("employee role selector source", () => {
  it("builds options from assignable roles and excludes PLATFORM", () => {
    const options = buildEmployeeRoleOptions({
      assignableRoles: [
        { id: "custom-1", name: "Sales Lead", role_type: "CUSTOM", company_id: "co-1" },
        { id: "admin-1", name: "Company Admin", role_type: "DEFAULT", company_id: "co-1" },
        { id: "platform-1", name: "Super", role_type: "PLATFORM", company_id: null },
      ],
      currentOnlyLabel: "current only",
    });
    assert.deepEqual(
      options.map((option) => option.value),
      ["custom-1", "admin-1"],
    );
  });

  it("newly created custom roles appear and inactive/missing current role stays visible", () => {
    const created = buildEmployeeRoleOptions({
      assignableRoles: [{ id: "new-role", name: "Night Shift", role_type: "CUSTOM", company_id: "co-1" }],
      currentOnlyLabel: "current only",
    });
    assert.equal(created[0].label, "Night Shift");

    const withCurrent = buildEmployeeRoleOptions({
      assignableRoles: [{ id: "custom-1", name: "Sales Lead", role_type: "CUSTOM", company_id: "co-1" }],
      currentRole: { roleId: "archived-9", roleName: "Old Role" },
      currentOnlyLabel: "Current role — no longer in the assignable catalog",
    });
    assert.equal(withCurrent[0].value, "archived-9");
    assert.equal(withCurrent[0].currentOnly, true);
    assert.equal(withCurrent[1].value, "custom-1");
  });

  it("employee/user dialogs do not hardcode admin/manager/employee", () => {
    const files = [
      join(here, "../../components/users/edit-managed-user-dialog.tsx"),
      join(here, "../../components/users/invite-managed-user-dialog.tsx"),
      join(here, "../../components/company-workspace/employees/employee-bulk-assign-dialog.tsx"),
      join(here, "../../lib/users/fetch-assignable-roles.ts"),
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      assert.equal(isHardcodedRoleNameList(source), false, file);
      assert.match(source, /useCompanyAssignableRoles|get_assignable_roles|buildEmployeeRoleOptions/);
    }
  });
});
