import { TICKET_PERMISSIONS } from "../constants.js";
import { TicketPermissionDeniedError, TicketValidationError } from "../errors.js";
import type { TicketServiceContext } from "../types/ticket-types.js";

export function assertTicketPermission(ctx: TicketServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new TicketPermissionDeniedError(permission);
  }
}

export function assertTicketCompanyAccess(ctx: TicketServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new TicketPermissionDeniedError(TICKET_PERMISSIONS.view);
  }
}

export function assertTicketActor(ctx: TicketServiceContext): string {
  if (!ctx.userId?.trim()) {
    throw new TicketValidationError("An authenticated user is required for ticket operations.");
  }
  return ctx.userId.trim();
}

export function assertTicketManageOrEdit(
  ctx: TicketServiceContext,
  actionPermission: string,
): void {
  if (ctx.isSuperAdmin) return;
  if (ctx.hasPermission(TICKET_PERMISSIONS.manage) || ctx.hasPermission(actionPermission)) return;
  throw new TicketPermissionDeniedError(actionPermission);
}
