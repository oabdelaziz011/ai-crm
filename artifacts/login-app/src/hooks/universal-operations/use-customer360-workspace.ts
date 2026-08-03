import {
  resolveVisibleSections,
  DEFAULT_CUSTOMER360_SECTIONS,
  type Customer360WorkspaceRole,
} from "@workspace/universal-operations-engine";
import type { OperationsRow } from "@workspace/universal-operations-engine";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "@/lib/application-layer/application-layer-bootstrap";
import { mapCustomer360AggregateToWorkspace } from "@/lib/application-layer/customer360-workspace-mapper";
import { buildMockCustomer360Workspace } from "@workspace/universal-operations-engine";

async function loadLiveCustomer360Workspace(
  row: OperationsRow,
  customerName: string,
  role: Customer360WorkspaceRole,
  input: {
    companyId: string;
    actorUserId: string;
    isSuperAdmin: boolean;
    hasPermission: (code: string) => boolean;
  },
) {
  const portContext = {
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    isSuperAdmin: input.isSuperAdmin,
    hasPermission: input.hasPermission,
  };

  const registry = createLoginAppApplicationLayerRegistry(portContext);
  const services = registry.getServices();
  const context = buildApplicationContext({
    tenantId: input.companyId,
    actorId: input.actorUserId,
    permissions: permissionCodes(input.hasPermission, input.isSuperAdmin),
  });

  const customerId = row.customerId;
  if (!customerId) {
    return buildMockCustomer360Workspace(row.id, customerName, row);
  }

  const visibleSections = resolveVisibleSections(DEFAULT_CUSTOMER360_SECTIONS, role).map((section) => section.id);

  const result = await services.customer360.getCustomer360Aggregate(
    {
      customerId,
      leadId: row.leadId,
      templateKey: "clinic",
      role,
      visibleSections,
    },
    context,
  );

  return mapCustomer360AggregateToWorkspace(result.data, row);
}

export function useCustomer360Workspace(row: OperationsRow | null, role: Customer360WorkspaceRole = "manager") {
  const customerName = row ? String(row.values.customer ?? "") : null;
  const { user, company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();

  const sections = useMemo(
    () => resolveVisibleSections(DEFAULT_CUSTOMER360_SECTIONS, role),
    [role],
  );

  const canLoadLive = Boolean(row?.id && customerName && company?.id && user?.id);

  const dataQuery = useQuery({
    queryKey: ["customer360-workspace", row?.id, customerName, company?.id, role],
    enabled: canLoadLive,
    queryFn: () =>
      loadLiveCustomer360Workspace(row!, customerName!, role, {
        companyId: company!.id,
        actorUserId: user!.id,
        isSuperAdmin,
        hasPermission,
      }),
    staleTime: 60_000,
  });

  return { data: dataQuery.data, isLoading: dataQuery.isLoading, sections, role };
}

export function useCustomer360Role() {
  const [role, setRole] = useState<Customer360WorkspaceRole>("manager");
  return { role, setRole };
}
