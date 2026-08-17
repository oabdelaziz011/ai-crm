import {

  resolveVisibleSections,

  buildEmptyCustomer360Workspace,

  OperationsRuntimeConfigurationError,

  type Customer360WorkspaceRole,

} from "@workspace/universal-operations-engine";

import type { OperationsRow } from "@workspace/universal-operations-engine";

import { useAuth } from "@/context/auth-context";

import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";

import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import {

  buildApplicationContext,

  createLoginAppApplicationLayerRegistry,

  permissionCodes,

} from "@/lib/application-layer/application-layer-bootstrap";

import { mapCustomer360AggregateToWorkspace } from "@/lib/application-layer/customer360-workspace-mapper";

import { useUniversalOperationsConfig } from "./use-universal-operations-queue";

import { useWorkspacePlatformOptional } from "@/context/workspace-platform-context";



async function loadLiveCustomer360Workspace(

  row: OperationsRow,

  customerName: string,

  role: Customer360WorkspaceRole,

  templateKey: string,

  visibleSectionIds: string[],

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

    return buildEmptyCustomer360Workspace();

  }



  const result = await services.customer360.getCustomer360Aggregate(

    {

      customerId,

      leadId: row.leadId,

      templateKey,

      role,

      visibleSections: visibleSectionIds,

    },

    context,

  );



  return mapCustomer360AggregateToWorkspace(result.data, row);

}



export function useCustomer360Workspace(row: OperationsRow | null, role: Customer360WorkspaceRole = "manager") {

  const customerName = row ? String(row.values.customer ?? "") : null;

  const { user, company } = useAuth();

  const { hasCompanyPermission: hasPermission, isSuperAdmin } = useCompanyPermissionAuth();

  const platform = useWorkspacePlatformOptional();

  const templateKey = platform?.templateKey ?? "clinic";

  const configQuery = useUniversalOperationsConfig(templateKey);



  const sectionConfig = configQuery.data?.customer360?.sections ?? [];



  const sections = useMemo(

    () => resolveVisibleSections(sectionConfig, role),

    [sectionConfig, role],

  );



  const configError = useMemo(() => {

    if (configQuery.isLoading) return null;

    if (configQuery.isError) return configQuery.error;

    if (sectionConfig.length === 0) {

      return new OperationsRuntimeConfigurationError(

        "configuration.customer360.sections is required — load seeded configuration from the Configuration Platform",

      );

    }

    return null;

  }, [configQuery.isLoading, configQuery.isError, configQuery.error, sectionConfig.length]);



  const canLoadLive = Boolean(

    row?.id &&

      customerName &&

      company?.id &&

      user?.id &&

      !configQuery.isLoading &&

      !configError &&

      sectionConfig.length > 0 &&

      row.customerId,

  );



  const dataQuery = useQuery({

    queryKey: ["customer360-workspace", row?.id, customerName, company?.id, role, templateKey, sectionConfig.length],

    enabled: canLoadLive,

    queryFn: () =>

      loadLiveCustomer360Workspace(row!, customerName!, role, templateKey, sections.map((s) => s.id), {

        companyId: company!.id,

        actorUserId: user!.id,

        isSuperAdmin,

        hasPermission,

      }),

    staleTime: 60_000,

  });



  const emptyData = useMemo(() => buildEmptyCustomer360Workspace(), []);



  const data = useMemo(() => {

    if (!row) return emptyData;

    if (!row.customerId) return emptyData;

    if (configError) return null;

    return dataQuery.data ?? null;

  }, [row, emptyData, configError, dataQuery.data]);



  return {

    data,

    isLoading: Boolean(row?.customerId && (configQuery.isLoading || dataQuery.isLoading)),

    configError,

    sections,

    role,

    terminology: configQuery.data?.terminology,

  };

}



export function useCustomer360Role() {

  const [role, setRole] = useState<Customer360WorkspaceRole>("manager");

  return { role, setRole };

}

