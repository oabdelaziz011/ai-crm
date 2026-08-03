import type { ServiceContext } from "../types.js";

/**
 * Ticket tool permissions aligned with support_tickets RLS (migration 214).
 */
export const TICKET_TOOL_PERMISSION_ALIASES: Record<string, readonly string[]> = {
  "tickets.view": ["tickets.manage"],
  "tickets.create": ["tickets.manage"],
  "tickets.edit": ["tickets.manage"],
  "tickets.assign": ["tickets.manage"],
  "tickets.comment": ["tickets.manage"],
  "tickets.close": ["tickets.manage", "tickets.edit"],
};

export type TicketToolPermissionRequirement = {
  toolKey: string;
  requiredPermissions: readonly string[];
};

export const TICKET_TOOL_ALIGNED_REQUIREMENTS: readonly TicketToolPermissionRequirement[] = [
  { toolKey: "create_ticket", requiredPermissions: ["tools.execute", "tickets.create"] },
  { toolKey: "update_ticket", requiredPermissions: ["tools.execute", "tickets.edit"] },
  { toolKey: "close_ticket", requiredPermissions: ["tools.execute", "tickets.close"] },
  { toolKey: "assign_ticket", requiredPermissions: ["tools.execute", "tickets.assign"] },
  { toolKey: "add_ticket_comment", requiredPermissions: ["tools.execute", "tickets.comment"] },
  { toolKey: "change_ticket_priority", requiredPermissions: ["tools.execute", "tickets.edit"] },
  { toolKey: "change_ticket_status", requiredPermissions: ["tools.execute", "tickets.edit"] },
  { toolKey: "search_ticket", requiredPermissions: ["tools.execute", "tickets.view"] },
];

const TICKET_TOOL_REQUIREMENTS_BY_KEY = new Map(
  TICKET_TOOL_ALIGNED_REQUIREMENTS.map((entry) => [entry.toolKey, entry.requiredPermissions]),
);

export function getAlignedTicketToolRequirements(toolKey: string): readonly string[] | null {
  return TICKET_TOOL_REQUIREMENTS_BY_KEY.get(toolKey) ?? null;
}

export function hasAlignedTicketPermission(
  ctx: Pick<ServiceContext, "isSuperAdmin" | "hasPermission">,
  requiredPermission: string,
): boolean {
  if (ctx.isSuperAdmin) return true;
  if (ctx.hasPermission(requiredPermission)) return true;

  const aliases = TICKET_TOOL_PERMISSION_ALIASES[requiredPermission];
  if (!aliases) return false;

  return aliases.some((alias) => ctx.hasPermission(alias));
}

export function findMissingTicketAlignedPermission(
  ctx: Pick<ServiceContext, "isSuperAdmin" | "hasPermission">,
  requiredPermissions: readonly string[],
): string | null {
  if (ctx.isSuperAdmin) return null;

  for (const permission of requiredPermissions) {
    if (!hasAlignedTicketPermission(ctx, permission)) {
      return permission;
    }
  }

  return null;
}

export function formatTicketToolPermissionMessage(toolKey: string, missingPermission: string): string {
  return `Ticket tool "${toolKey}" requires permission "${missingPermission}".`;
}
