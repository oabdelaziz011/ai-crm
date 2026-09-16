/**
 * Presentation-only Roles UI taxonomy.
 * Authorization continues to use canonical permission codes — never family/module ids.
 */

export const EMAIL_WORKSPACE_PERMISSION_CODES = [
  "ai.conversations.view",
  "ai.conversations.view_assigned",
  "ai.conversations.reply",
  "ai.conversations.takeover",
  "ai.conversations.release",
] as const;

/** Codes shown under Email because they power Email Workspace / mailbox, not because they are exclusive to Email. */
export const EMAIL_MODULE_PERMISSION_CODES = new Set<string>([
  ...EMAIL_WORKSPACE_PERMISSION_CODES,
  "conversation.assign",
  "email.view",
  "email.run",
  "email.templates.view",
  "email.routing.view",
  "ai.email.manage",
  "email.settings.manage",
  "email.identity.manage",
  "email.identity.company.manage",
]);

export type PermissionFamilyId =
  | "aiPlatform"
  | "crm"
  | "company"
  | "finance"
  | "operations";

export type PermissionFamilyDefinition = {
  id: PermissionFamilyId;
  order: number;
  moduleIds: readonly string[];
};

/**
 * Product families follow the live sidebar / ValueOR modules.
 * Email is listed first under AI Platform by product request.
 */
export const PERMISSION_FAMILIES: readonly PermissionFamilyDefinition[] = [
  {
    id: "aiPlatform",
    order: 10,
    moduleIds: [
      "email",
      "channels",
      "whatsapp",
      "conversations",
      "handoff",
      "aiAssistant",
      "aiChat",
      "knowledge",
      "prompts",
      "agents",
      "skills",
      "automation",
      "aiAnalytics",
      "aiPlatform",
      "governance",
      "operations",
      "configuration",
      "featureFlags",
    ],
  },
  {
    id: "crm",
    order: 20,
    moduleIds: [
      "customers",
      "leads",
      "opportunities",
      "tickets",
      "products",
      "quotes",
      "bookings",
      "scheduling",
      "invoices",
    ],
  },
  {
    id: "company",
    order: 30,
    moduleIds: [
      "company",
      "organization",
      "users",
      "roles",
      "settings",
      "audit",
      "companies",
      "workspace",
      "dashboard",
    ],
  },
  {
    id: "finance",
    order: 40,
    moduleIds: ["billing", "reports", "executive", "licenses"],
  },
  {
    id: "operations",
    order: 50,
    moduleIds: ["tasks", "marketplace", "integrations"],
  },
] as const;

const MODULE_FAMILY = new Map<string, PermissionFamilyId>();
const MODULE_ORDER = new Map<string, number>();

for (const family of PERMISSION_FAMILIES) {
  family.moduleIds.forEach((moduleId, index) => {
    MODULE_FAMILY.set(moduleId, family.id);
    MODULE_ORDER.set(moduleId, family.order * 100 + index);
  });
}

export function overlayPermissionModuleId(code: string): string | null {
  if (EMAIL_MODULE_PERMISSION_CODES.has(code)) return "email";
  if (code.startsWith("email.")) return "email";
  if (code.startsWith("prompts.")) return "prompts";
  if (code.startsWith("agents.")) return "agents";
  return null;
}

export function resolvePermissionFamilyId(moduleId: string): PermissionFamilyId {
  return MODULE_FAMILY.get(moduleId) ?? "operations";
}

export function permissionModuleSortKey(moduleId: string): number {
  return MODULE_ORDER.get(moduleId) ?? 90_000;
}

export type PermissionLike = {
  id: string;
  code?: string | null;
};

export type GroupedPermissionModule<T extends PermissionLike> = {
  moduleId: string;
  familyId: PermissionFamilyId;
  permissions: T[];
};

export type GroupedPermissionFamily<T extends PermissionLike> = {
  familyId: PermissionFamilyId;
  modules: GroupedPermissionModule<T>[];
};

export function groupPermissionsForRoleEditor<T extends PermissionLike>(
  permissions: readonly T[],
  resolveModuleId: (code: string, permission: T) => string,
): GroupedPermissionFamily<T>[] {
  const modules = new Map<string, T[]>();

  for (const permission of permissions) {
    const code = permission.code ?? permission.id;
    const moduleId = resolveModuleId(code, permission);
    const list = modules.get(moduleId) ?? [];
    list.push(permission);
    modules.set(moduleId, list);
  }

  const familyMap = new Map<PermissionFamilyId, GroupedPermissionModule<T>[]>();
  for (const [moduleId, items] of modules) {
    const familyId = resolvePermissionFamilyId(moduleId);
    const list = familyMap.get(familyId) ?? [];
    list.push({ moduleId, familyId, permissions: items });
    familyMap.set(familyId, list);
  }

  const familyOrder = new Map(PERMISSION_FAMILIES.map((family) => [family.id, family.order]));

  return Array.from(familyMap.entries())
    .map(([familyId, familyModules]) => ({
      familyId,
      modules: familyModules.sort(
        (a, b) =>
          permissionModuleSortKey(a.moduleId) - permissionModuleSortKey(b.moduleId) ||
          a.moduleId.localeCompare(b.moduleId),
      ),
    }))
    .sort(
      (a, b) =>
        (familyOrder.get(a.familyId) ?? 999) - (familyOrder.get(b.familyId) ?? 999) ||
        a.familyId.localeCompare(b.familyId),
    );
}

export function filterPermissionsBySearch<T extends PermissionLike>(
  permissions: readonly T[],
  query: string,
  haystack: (code: string, permission: T) => string,
): T[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...permissions];
  return permissions.filter((permission) => {
    const code = permission.code ?? permission.id;
    return haystack(code, permission).includes(normalized);
  });
}

export function countSelectedInCodes(
  selected: readonly string[],
  codes: readonly string[],
): { selected: number; total: number; all: boolean; none: boolean; partial: boolean } {
  const selectedSet = new Set(selected);
  const selectedCount = codes.filter((code) => selectedSet.has(code)).length;
  return {
    selected: selectedCount,
    total: codes.length,
    all: codes.length > 0 && selectedCount >= codes.length,
    none: selectedCount === 0,
    partial: selectedCount > 0 && selectedCount < codes.length,
  };
}
