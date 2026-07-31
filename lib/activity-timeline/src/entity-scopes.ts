import type { TimelineEntityScope, TimelineEntityType } from "./types.js";

export function createCustomerTimelineScope(
  companyId: string,
  customerId: string,
): TimelineEntityScope {
  return {
    entityType: "customer",
    entityId: customerId,
    companyId,
  };
}

export function createAccountTimelineScope(
  companyId: string,
  accountId: string,
): TimelineEntityScope {
  return {
    entityType: "account",
    entityId: accountId,
    companyId,
  };
}

export function isSupportedTimelineEntity(entityType: TimelineEntityType): boolean {
  return entityType === "customer" || entityType === "account";
}
