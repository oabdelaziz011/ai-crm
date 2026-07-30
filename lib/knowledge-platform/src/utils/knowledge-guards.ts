import { KNOWLEDGE_PERMISSIONS } from "../constants.js";
import { KnowledgeFeatureDisabledError, PermissionDeniedError } from "../errors.js";
import type { ServiceContext } from "../types.js";

export function assertKnowledgeFeatureEnabled(ctx: ServiceContext): void {
  if (ctx.isSuperAdmin) return;
  if (ctx.isKnowledgeFeatureEnabled && !ctx.isKnowledgeFeatureEnabled()) {
    throw new KnowledgeFeatureDisabledError();
  }
}

export function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) throw new PermissionDeniedError(permission);
}

export function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(KNOWLEDGE_PERMISSIONS.view);
  }
}

export function assertKnowledgeTenantAccess(
  ctx: ServiceContext,
  companyId: string,
  permission: string,
): void {
  assertKnowledgeFeatureEnabled(ctx);
  assertPermission(ctx, permission);
  assertCompanyAccess(ctx, companyId);
}
