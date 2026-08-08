import type { ReactNode } from "react";
import { OperationsEntityWorkspace } from "@/components/entity-workspace/operations-entity-workspace";
import {
  resolveEntityWorkspaceLayout,
  type EntityWorkspaceModuleId,
} from "@/lib/entity-workspace";

type Props = {
  module: EntityWorkspaceModuleId;
  entityType: string;
  entityId: string;
  tab?: string;
  operationId?: string | null;
  /** CRM module continues to use CustomerWorkspacePage via its own route. */
  crmFallback?: ReactNode;
};

/**
 * Module-aware Entity Workspace host.
 * Operations → live execution workspace. CRM → existing Customer Workspace route.
 */
export function EntityWorkspaceHost({
  module,
  entityType,
  entityId,
  tab,
  operationId,
  crmFallback,
}: Props) {
  const layout = resolveEntityWorkspaceLayout(module, entityType);

  if (module === "crm" && crmFallback) {
    return <>{crmFallback}</>;
  }

  if (module === "operations" || layout) {
    return (
      <OperationsEntityWorkspace
        entityType={entityType}
        entityId={entityId}
        tab={tab}
        operationId={operationId}
      />
    );
  }

  return null;
}
