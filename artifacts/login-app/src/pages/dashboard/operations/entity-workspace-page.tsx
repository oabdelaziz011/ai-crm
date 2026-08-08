import { useMemo } from "react";
import { useParams, useSearch } from "wouter";
import { OperationsEntityWorkspace } from "@/components/entity-workspace/operations-entity-workspace";

/**
 * Operations-local Entity Workspace host.
 * Route: /dashboard/operations/entity/:entityType/:entityId/:tab?
 * Never redirects into CRM.
 */
export function OperationsEntityWorkspacePage() {
  const params = useParams<{ entityType: string; entityId: string; tab?: string }>();
  const search = useSearch();
  const operationId = useMemo(() => {
    const value = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(
      "operationId",
    );
    return value?.trim() || null;
  }, [search]);

  const entityType = params.entityType?.trim() || "customer";
  const entityId = params.entityId?.trim() || "";

  if (!entityId) {
    return null;
  }

  return (
    <OperationsEntityWorkspace
      entityType={entityType}
      entityId={entityId}
      tab={params.tab}
      operationId={operationId}
    />
  );
}
