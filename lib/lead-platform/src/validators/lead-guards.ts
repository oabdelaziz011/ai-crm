import { LeadPermissionDeniedError, LeadValidationError } from "../errors.js";
import type { LeadServiceContext } from "../types/lead-types.js";

export function assertLeadActor(ctx: LeadServiceContext): string {
  if (ctx.isSuperAdmin && ctx.userId) return ctx.userId;
  if (!ctx.userId) throw new LeadValidationError("Authenticated user is required.");
  return ctx.userId;
}

export function assertLeadCompanyAccess(ctx: LeadServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new LeadPermissionDeniedError("company.access");
  }
}

export function assertLeadPermission(ctx: LeadServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new LeadPermissionDeniedError(permission);
  }
}

export function readRequiredString(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new LeadValidationError(`${label} is required.`);
  return normalized;
}

export function readOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}
