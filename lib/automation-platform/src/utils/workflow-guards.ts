import { AUTOMATION_PERMISSIONS } from "../constants.js";
import { PermissionDeniedError, WorkflowFeatureDisabledError } from "../errors.js";
import type { ServiceContext } from "../types.js";

export function assertWorkflowFeatureEnabled(ctx: ServiceContext): void {
  if (ctx.isSuperAdmin) return;
  if (ctx.isWorkflowFeatureEnabled && !ctx.isWorkflowFeatureEnabled()) {
    throw new WorkflowFeatureDisabledError();
  }
}

export function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) throw new PermissionDeniedError(permission);
}

export function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(AUTOMATION_PERMISSIONS.view);
  }
}

export function assertWorkflowTenantAccess(
  ctx: ServiceContext,
  companyId: string,
  permission: string,
): void {
  assertWorkflowFeatureEnabled(ctx);
  assertPermission(ctx, permission);
  assertCompanyAccess(ctx, companyId);
}

export function assertWorkflowExecutionAllowed(ctx: ServiceContext): void {
  assertWorkflowFeatureEnabled(ctx);
}
