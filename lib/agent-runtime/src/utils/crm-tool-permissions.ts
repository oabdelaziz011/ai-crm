import type { ServiceContext } from "../types.js";

/**
 * CRM agent tool permissions aligned with CRM table RLS (167/170).
 * Legacy agent-specific codes remain accepted via alias satisfaction for backward compatibility.
 * Single source of truth for Agent Runtime and AI Tool Router permission alignment.
 */
export const CRM_TOOL_PERMISSION_ALIASES: Record<string, readonly string[]> = {  "customers.view": ["customers.search"],
  "customers.edit": ["customers.update"],
  "customers.create": ["customers.import"],
  "customers.delete": ["customers.merge"],
};

/** Tool keys that accept the legacy customers.merge code as a bundle gate. */
export const CRM_MERGE_TOOL_KEYS = new Set(["merge_customers"]);

export type CrmToolPermissionRequirement = {
  toolKey: string;
  requiredPermissions: readonly string[];
};

/** Aligned required permissions per CRM agent tool (matches migration 199 tool_definitions). */
export const CRM_TOOL_ALIGNED_REQUIREMENTS: readonly CrmToolPermissionRequirement[] = [
  { toolKey: "search_customer", requiredPermissions: ["tools.execute", "customers.view"] },
  { toolKey: "find_duplicate_customers", requiredPermissions: ["tools.execute", "customers.view"] },
  { toolKey: "update_customer", requiredPermissions: ["tools.execute", "customers.edit"] },
  { toolKey: "merge_customers", requiredPermissions: ["tools.execute", "customers.edit", "customers.delete"] },
  { toolKey: "import_customers", requiredPermissions: ["tools.execute", "customers.create"] },
  { toolKey: "create_customer", requiredPermissions: ["tools.execute", "customers.create"] },
  { toolKey: "invoice_search", requiredPermissions: ["tools.execute", "invoices.view"] },
  { toolKey: "booking_search", requiredPermissions: ["tools.execute", "bookings.view"] },
  { toolKey: "knowledge_search", requiredPermissions: ["tools.execute", "knowledge.view"] },
];

const CRM_TOOL_REQUIREMENTS_BY_KEY = new Map(
  CRM_TOOL_ALIGNED_REQUIREMENTS.map((entry) => [entry.toolKey, entry.requiredPermissions]),
);

export function getAlignedCrmToolRequirements(toolKey: string): readonly string[] | null {
  return CRM_TOOL_REQUIREMENTS_BY_KEY.get(toolKey) ?? null;
}

export function hasAlignedPermission(
  ctx: Pick<ServiceContext, "isSuperAdmin" | "hasPermission">,
  requiredPermission: string,
): boolean {
  if (ctx.isSuperAdmin) return true;
  if (ctx.hasPermission(requiredPermission)) return true;

  const aliases = CRM_TOOL_PERMISSION_ALIASES[requiredPermission];
  if (!aliases) return false;

  return aliases.some((alias) => ctx.hasPermission(alias));
}

export function findMissingAlignedPermission(
  ctx: Pick<ServiceContext, "isSuperAdmin" | "hasPermission">,
  requiredPermissions: readonly string[],
  toolKey?: string,
): string | null {
  if (ctx.isSuperAdmin) return null;

  if (toolKey && CRM_MERGE_TOOL_KEYS.has(toolKey) && ctx.hasPermission("customers.merge")) {
    return null;
  }

  for (const permission of requiredPermissions) {
    if (!hasAlignedPermission(ctx, permission)) {
      return permission;
    }
  }

  return null;
}

export function formatCrmToolPermissionMessage(toolKey: string, missingPermission: string): string {
  return `CRM tool "${toolKey}" requires permission "${missingPermission}".`;
}
