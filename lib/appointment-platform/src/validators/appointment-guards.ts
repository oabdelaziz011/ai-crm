import { APPOINTMENT_PERMISSIONS } from "../constants.js";
import { AppointmentPermissionError, AppointmentValidationError } from "../errors.js";
import type { AppointmentServiceContext } from "../types/appointment-types.js";

export function assertAppointmentActor(ctx: AppointmentServiceContext): string {
  if (!ctx.userId) throw new AppointmentPermissionError("Authenticated user required.");
  return ctx.userId;
}

export function assertAppointmentCompanyAccess(ctx: AppointmentServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (ctx.companyId !== companyId) throw new AppointmentPermissionError("Company access denied.");
}

export function assertAppointmentPermission(ctx: AppointmentServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) throw new AppointmentPermissionError(`Missing permission: ${permission}`);
}

export function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppointmentValidationError(`${field} is required.`);
  }
  return value.trim();
}

export function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

export function requireAppointmentPermission(ctx: AppointmentServiceContext, action: keyof typeof APPOINTMENT_PERMISSIONS): string {
  assertAppointmentPermission(ctx, APPOINTMENT_PERMISSIONS[action]);
  return assertAppointmentActor(ctx);
}
