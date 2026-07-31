import { AGENT_PERMISSIONS } from "../constants.js";
import { AgentsFeatureDisabledError, AgentsPermissionDeniedError } from "../errors.js";
import type { ServiceContext } from "../types.js";

export function assertAgentsFeatureEnabled(ctx: ServiceContext): void {
  if (ctx.isSuperAdmin) return;
  if (ctx.isAgentsFeatureEnabled && !ctx.isAgentsFeatureEnabled()) {
    throw new AgentsFeatureDisabledError();
  }
}

export function assertAgentsViewPermission(ctx: ServiceContext): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(AGENT_PERMISSIONS.view)) {
    throw new AgentsPermissionDeniedError(AGENT_PERMISSIONS.view);
  }
}

export function assertAgentsExecutePermission(ctx: ServiceContext): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(AGENT_PERMISSIONS.execute)) {
    throw new AgentsPermissionDeniedError(AGENT_PERMISSIONS.execute);
  }
}

export function assertAgentsManagePermission(ctx: ServiceContext): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(AGENT_PERMISSIONS.manage)) {
    throw new AgentsPermissionDeniedError(AGENT_PERMISSIONS.manage);
  }
}

export function assertAgentsReadAccess(ctx: ServiceContext): void {
  assertAgentsFeatureEnabled(ctx);
  assertAgentsViewPermission(ctx);
}

export function assertAgentsExecuteAccess(ctx: ServiceContext): void {
  assertAgentsFeatureEnabled(ctx);
  assertAgentsExecutePermission(ctx);
}

export function assertAgentsManageAccess(ctx: ServiceContext): void {
  assertAgentsFeatureEnabled(ctx);
  assertAgentsManagePermission(ctx);
}
