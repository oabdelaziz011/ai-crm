import { PermissionDeniedError } from "../errors/application-errors.js";
import type { ApplicationContext } from "../contracts/application-context.js";

export function assertPermission(context: ApplicationContext, permission: string): void {
  if (!context.permissions.includes(permission) && !context.permissions.includes("*")) {
    throw new PermissionDeniedError(`Missing permission: ${permission}`);
  }
}

export function assertAnyPermission(context: ApplicationContext, permissions: readonly string[]): void {
  if (permissions.length === 0) return;
  const hasAny = permissions.some((p) => context.permissions.includes(p) || context.permissions.includes("*"));
  if (!hasAny) {
    throw new PermissionDeniedError(`Missing one of: ${permissions.join(", ")}`);
  }
}

export function assertTenant(context: ApplicationContext, tenantId: string): void {
  if (context.tenantId !== tenantId) {
    throw new PermissionDeniedError("Tenant context mismatch");
  }
}

export function assertFeatureFlag(context: ApplicationContext, flag: string): void {
  if (context.featureFlags[flag] === false) {
    throw new PermissionDeniedError(`Feature disabled: ${flag}`);
  }
}
