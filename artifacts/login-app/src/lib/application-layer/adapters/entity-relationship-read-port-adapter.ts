import type { EntityRelationshipReadPort } from "@workspace/application-layer";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

/** Stub until entity_relationships table ships — returns direct FK hints only. */
export function createLoginAppEntityRelationshipReadPort(
  ctx: LoginAppPortContext,
): EntityRelationshipReadPort {
  return {
    async listForEntity(_tenantId, _entityType, _entityId) {
      if (!ctx.hasPermission("leads.view")) return [];
      return [];
    },
  };
}
