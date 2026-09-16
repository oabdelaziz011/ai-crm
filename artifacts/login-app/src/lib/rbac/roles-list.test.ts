/**
 * Roles list query helpers (search, type, pagination, Super Admin identity).
 * Run: pnpm exec tsx --test src/lib/rbac/roles-list.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  applyRolesListQuery,
  assertRoleTypeDeletable,
  canonicalRoleType,
  canDeleteRoleFromList,
  canMutateRoleFromList,
  countByKey,
  filterRolesByType,
  isPlatformSuperAdminRole,
  isProtectedRoleType,
  listActionsForRole,
  paginateRoles,
  presentRoleTypeFilters,
  roleMatchesSearch,
  scopeRolesToWorkspace,
  sortRoles,
  summarizeWorkspaceRoles,
  uniqueUserCount,
} from "./roles-list.ts";

const here = dirname(fileURLToPath(import.meta.url));
const loginAppSrc = join(here, "../..");

const platformSuperAdmin = {
  id: "platform-1",
  name: "Super Admin",
  description: "Platform operator",
  company_id: null,
  role_type: "PLATFORM",
  updated_at: "2026-01-02T00:00:00.000Z",
};

const customNamedSuperAdmin = {
  id: "custom-sa",
  name: "Super Admin",
  description: "Tenant copycat",
  company_id: "co-1",
  role_type: "CUSTOM",
  updated_at: "2026-03-01T00:00:00.000Z",
};

const companyAdmin = {
  id: "default-1",
  name: "Company Admin",
  description: "Default company administrator",
  company_id: "co-1",
  role_type: "DEFAULT",
  updated_at: "2026-02-01T00:00:00.000Z",
};

const qaAgent = {
  id: "custom-1",
  name: "QA Agent",
  description: "مختص ضمان الجودة",
  company_id: "co-1",
  role_type: "CUSTOM",
  updated_at: "2026-04-01T00:00:00.000Z",
};

const otherCompanyCustom = {
  id: "custom-other",
  name: "Other Tenant Role",
  description: "Should not leak",
  company_id: "co-2",
  role_type: "CUSTOM",
  updated_at: "2026-05-01T00:00:00.000Z",
};

describe("role categories use canonical role_type", () => {
  it("identifies PLATFORM Super Admin by role_type, not by name", () => {
    assert.equal(isPlatformSuperAdminRole(platformSuperAdmin), true);
    assert.equal(isPlatformSuperAdminRole(customNamedSuperAdmin), false);
    assert.equal(canonicalRoleType(customNamedSuperAdmin), "CUSTOM");
    assert.equal(isProtectedRoleType(platformSuperAdmin), true);
    assert.equal(isProtectedRoleType(companyAdmin), true);
    assert.equal(isProtectedRoleType(qaAgent), false);
  });

  it("never treats DEFAULT/PLATFORM as mutable or deletable", () => {
    assert.equal(canMutateRoleFromList(platformSuperAdmin), false);
    assert.equal(canDeleteRoleFromList(platformSuperAdmin), false);
    assert.equal(canMutateRoleFromList(companyAdmin), false);
    assert.equal(canDeleteRoleFromList(companyAdmin), false);
    assert.equal(canMutateRoleFromList(qaAgent), true);
    assert.equal(canDeleteRoleFromList(qaAgent), true);
    assert.throws(() => assertRoleTypeDeletable("PLATFORM"), /ROLE_PROTECTED_READ_ONLY/);
    assert.throws(() => assertRoleTypeDeletable("DEFAULT"), /ROLE_PROTECTED_READ_ONLY/);
    assert.doesNotThrow(() => assertRoleTypeDeletable("CUSTOM"));
  });
});

describe("workspace scoping and cross-company isolation", () => {
  const catalog = [platformSuperAdmin, companyAdmin, qaAgent, otherCompanyCustom, customNamedSuperAdmin];

  it("keeps PLATFORM plus current-company roles only", () => {
    const scoped = scopeRolesToWorkspace(catalog, "co-1");
    assert.deepEqual(
      scoped.map((role) => role.id),
      ["platform-1", "default-1", "custom-1", "custom-sa"],
    );
  });

  it("does not leak another company's custom roles", () => {
    const scoped = scopeRolesToWorkspace(catalog, "co-1");
    assert.equal(scoped.some((role) => role.company_id === "co-2"), false);
  });
});

describe("search, type filter, and pagination", () => {
  const roles = [platformSuperAdmin, companyAdmin, qaAgent, customNamedSuperAdmin];

  it("searches English and Arabic name/description", () => {
    assert.equal(roleMatchesSearch(qaAgent, "qa"), true);
    assert.equal(roleMatchesSearch(qaAgent, "ضمان"), true);
    assert.equal(roleMatchesSearch(companyAdmin, "administrator"), true);
    assert.equal(roleMatchesSearch(qaAgent, "billing"), false);
  });

  it("filters by canonical role_type", () => {
    assert.deepEqual(
      filterRolesByType(roles, "PLATFORM").map((role) => role.id),
      ["platform-1"],
    );
    assert.deepEqual(
      filterRolesByType(roles, "CUSTOM").map((role) => role.id).sort(),
      ["custom-1", "custom-sa"],
    );
    assert.deepEqual(presentRoleTypeFilters(roles), ["ALL", "PLATFORM", "DEFAULT", "CUSTOM"]);
    assert.deepEqual(presentRoleTypeFilters([qaAgent]), ["ALL", "CUSTOM"]);
  });

  it("paginates with a stable showing range", () => {
    const page1 = paginateRoles(roles, 1, 2);
    assert.equal(page1.from, 1);
    assert.equal(page1.to, 2);
    assert.equal(page1.total, 4);
    assert.equal(page1.totalPages, 2);
    assert.equal(paginateRoles(roles, 99, 2).page, 2);
  });

  it("applies search + type + sort together", () => {
    const result = applyRolesListQuery(roles, {
      search: "super",
      typeFilter: "ALL",
      sortKey: "name",
      sortDirection: "asc",
      page: 1,
      pageSize: 10,
    });
    assert.deepEqual(
      result.items.map((role) => role.id),
      ["platform-1", "custom-sa"],
    );
    const customOnly = applyRolesListQuery(roles, {
      search: "super",
      typeFilter: "CUSTOM",
      sortKey: "name",
      page: 1,
    });
    assert.deepEqual(
      customOnly.items.map((role) => role.id),
      ["custom-sa"],
    );
  });
});

describe("counts, empty summary, and actions", () => {
  it("counts role_permissions / user_roles rows without fabricating values", () => {
    assert.deepEqual(countByKey([{ role_id: "a" }, { role_id: "a" }, { role_id: "b" }]), {
      a: 2,
      b: 1,
    });
    assert.equal(
      uniqueUserCount([{ user_id: "u1" }, { user_id: "u1" }, { user_id: "u2" }]),
      2,
    );
  });

  it("summarizes visible categories from actual role_type values", () => {
    assert.deepEqual(
      summarizeWorkspaceRoles([platformSuperAdmin, companyAdmin, qaAgent, customNamedSuperAdmin]),
      { platform: 1, default: 1, custom: 2, total: 4 },
    );
  });

  it("sorts by permission and user counts when provided", () => {
    const sorted = sortRoles([qaAgent, companyAdmin], "permission_count", "desc", {
      permissionCountByRoleId: { "custom-1": 24, "default-1": 120 },
    });
    assert.deepEqual(
      sorted.map((role) => role.id),
      ["default-1", "custom-1"],
    );
  });

  it("exposes view-only actions for PLATFORM/DEFAULT and edit/delete for CUSTOM", () => {
    const allPerms = { canView: true, canEdit: true, canDelete: true };
    assert.deepEqual(listActionsForRole(platformSuperAdmin, allPerms), {
      view: true,
      edit: false,
      delete: false,
      viewOnly: true,
    });
    assert.equal(listActionsForRole(companyAdmin, allPerms).delete, false);
    assert.deepEqual(listActionsForRole(qaAgent, allPerms), {
      view: true,
      edit: true,
      delete: true,
      viewOnly: false,
    });
    assert.equal(listActionsForRole(qaAgent, { canView: true, canEdit: false, canDelete: false }).edit, false);
  });
});

describe("i18n and source contracts", () => {
  const en = JSON.parse(readFileSync(join(loginAppSrc, "locales/en/common.json"), "utf8")) as {
    roles: Record<string, unknown>;
  };
  const ar = JSON.parse(readFileSync(join(loginAppSrc, "locales/ar/common.json"), "utf8")) as {
    roles: Record<string, unknown>;
  };
  const page = readFileSync(join(loginAppSrc, "pages/roles.tsx"), "utf8");
  const dialog = readFileSync(join(loginAppSrc, "components/roles/role-form-dialog.tsx"), "utf8");
  const hook = readFileSync(join(loginAppSrc, "hooks/use-rbac.ts"), "utf8");
  const table = readFileSync(join(loginAppSrc, "components/roles/roles-list-table.tsx"), "utf8");
  const employeeEdit = readFileSync(join(loginAppSrc, "components/users/edit-managed-user-dialog.tsx"), "utf8");
  const emailAssignment = readFileSync(
    join(loginAppSrc, "lib/email-workspace/email-conversation-assignment.ts"),
    "utf8",
  );

  it("ships EN/AR list keys without leaving the page on raw key names", () => {
    const required = [
      "title",
      "subtitle",
      "createRole",
      "emptyCustomTitle",
      "emptyCustomDescription",
      "view",
      "viewOnly",
    ];
    for (const key of required) {
      assert.equal(typeof en.roles[key], "string", `en.roles.${key}`);
      assert.equal(typeof ar.roles[key], "string", `ar.roles.${key}`);
    }
    const listEn = en.roles.list as Record<string, unknown>;
    const listAr = ar.roles.list as Record<string, unknown>;
    for (const key of [
      "searchPlaceholder",
      "typeFilterAll",
      "typeFilterPlatform",
      "typeFilterDefault",
      "typeFilterCustom",
      "loadError",
      "retry",
      "noSearchResults",
      "summaryRange",
    ]) {
      assert.equal(typeof listEn[key], "string", `en.roles.list.${key}`);
      assert.equal(typeof listAr[key], "string", `ar.roles.list.${key}`);
    }
    assert.match(String(en.roles.title), /Roles/);
    assert.match(String(ar.roles.title), /الأدوار/);
    assert.match(page, /roles\.list\./);
    assert.doesNotMatch(page, /t\("roles\.[a-zA-Z.]+"\)\s*\+\s*t\(/);
  });

  it("protects PLATFORM Super Admin in the list UI and delete mutation", () => {
    assert.match(page, /isPlatformSuperAdminRole/);
    assert.match(page, /listActionsForRole/);
    assert.match(page, /readOnly/);
    assert.match(dialog, /readOnly/);
    assert.match(table, /roles-list-table/);
    assert.match(hook, /assertRoleTypeDeletable/);
    assert.match(page, /roles-list-skeleton|RolesListSkeleton/);
    assert.match(page, /roles-list-error/);
    assert.doesNotMatch(table, /canDeleteThisRole &&[\s\S]{0,80}PLATFORM/);
  });

  it("does not replace the employee role selector or email assignment source", () => {
    assert.match(employeeEdit, /useCompanyAssignableRoles|get_assignable_roles|buildEmployeeRoleOptions/);
    assert.match(emailAssignment, /assigned_user_id/);
    assert.doesNotMatch(employeeEdit, /\[[^\]]*['"]admin['"]\s*,\s*['"]manager['"]\s*,\s*['"]employee['"]/);
  });
});
