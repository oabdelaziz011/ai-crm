import { HandoffPermissionDeniedError, HandoffValidationError } from "../errors.js";
import type { HandoffServiceContext } from "../types/handoff-types.js";

export function assertHandoffActor(ctx: HandoffServiceContext): string {
  if (ctx.isSuperAdmin && ctx.userId) return ctx.userId;
  if (!ctx.userId) {
    throw new HandoffValidationError("Authenticated user is required for this action.");
  }
  return ctx.userId;
}

export function assertHandoffCompanyAccess(ctx: HandoffServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new HandoffPermissionDeniedError("company.access");
  }
}

export function assertHandoffPermission(ctx: HandoffServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new HandoffPermissionDeniedError(permission);
  }
}

export function readRequiredString(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new HandoffValidationError(`${label} is required.`);
  return normalized;
}

export function readOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}
