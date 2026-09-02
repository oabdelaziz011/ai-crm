import {
  CustomerNotFoundInTenantError,
  TimelineEntityAccessError,
  TimelinePermissionDeniedError,
  TimelineTenantIsolationError,
} from "./errors.js";
import type {
  TimelineAccessContext,
  TimelineEntityAccessPort,
  TimelineEntityScope,
  TimelineEntityType,
  TimelinePublisher,
} from "./types.js";

const CUSTOMER_TIMELINE_PERMISSION = "customers.view";
const ACCOUNT_TIMELINE_PERMISSION = "customers.view";

const ENTITY_PERMISSIONS: Record<string, string> = {
  customer: CUSTOMER_TIMELINE_PERMISSION,
  account: ACCOUNT_TIMELINE_PERMISSION,
};

export function resolveTimelinePermission(entityType: TimelineEntityType): string {
  return ENTITY_PERMISSIONS[String(entityType)] ?? CUSTOMER_TIMELINE_PERMISSION;
}

export function canViewTimeline(
  ctx: TimelineAccessContext,
  entityType: TimelineEntityType,
): boolean {
  if (ctx.isSuperAdmin) return true;
  return ctx.hasPermission(resolveTimelinePermission(entityType));
}

export function assertTimelineReadAccess(
  ctx: TimelineAccessContext,
  scope: TimelineEntityScope,
): void {
  if (ctx.isSuperAdmin) return;

  if (!ctx.companyId || ctx.companyId !== scope.companyId) {
    throw new TimelineTenantIsolationError();
  }

  const permission = resolveTimelinePermission(scope.entityType);
  if (!ctx.hasPermission(permission)) {
    throw new TimelinePermissionDeniedError(permission);
  }
}

export async function assertTimelineEntityAccess(
  ctx: TimelineAccessContext,
  scope: TimelineEntityScope,
  entityAccess?: TimelineEntityAccessPort,
): Promise<void> {
  assertTimelineReadAccess(ctx, scope);

  if (!entityAccess) return;

  try {
    await entityAccess.assertEntityAccess(ctx, scope);
  } catch (error) {
    if (
      error instanceof CustomerNotFoundInTenantError ||
      error instanceof TimelineEntityAccessError ||
      error instanceof TimelineTenantIsolationError
    ) {
      throw error;
    }
    throw new TimelineEntityAccessError(
      error instanceof Error ? error.message : "Entity access denied.",
    );
  }
}

export function filterPublishersByPermission(
  ctx: TimelineAccessContext,
  publishers: TimelinePublisher[],
): TimelinePublisher[] {
  if (ctx.isSuperAdmin) return publishers;

  return publishers.filter((publisher) => {
    const required = publisher.requiredPermissions ?? [];
    return required.every((permission) => ctx.hasPermission(permission));
  });
}
