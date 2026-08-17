import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "@/lib/application-layer/application-layer-bootstrap";
import { invalidateOperationsPlatformQueries } from "@/lib/application-layer/operations-platform-sync";

const OPERATIONS_WORKSPACE_DOMAIN = "operations.workspace";

function useConfigurationCommandContext() {
  const {
    companyId,
    isSuperAdmin,
    hasCompanyPermission,
    buildPortContext,
  } = useCompanyPermissionAuth();

  if (!companyId) return null;

  let portContext;
  try {
    portContext = buildPortContext();
  } catch {
    return null;
  }

  const registry = createLoginAppApplicationLayerRegistry(portContext);
  const context = buildApplicationContext({
    tenantId: companyId,
    actorId: portContext.actorUserId,
    permissions: permissionCodes(hasCompanyPermission, isSuperAdmin),
  });

  return { registry, context, companyId };
}

export function useConfigurationCommands(templateKey = "clinic") {
  const qc = useQueryClient();
  const cmdContext = useConfigurationCommandContext();

  const invalidate = () => {
    if (!cmdContext) return;
    void qc.invalidateQueries({ queryKey: ["universal-operations", "config"] });
    void qc.invalidateQueries({ queryKey: ["configuration"] });
    invalidateOperationsPlatformQueries(qc, { companyId: cmdContext.companyId });
  };

  const saveDraft = useMutation({
    mutationFn: async (config: Record<string, unknown>) => {
      if (!cmdContext) throw new Error("Not authenticated");
      const result = await cmdContext.registry.getServices().configuration.saveDraft(
        {
          domain: OPERATIONS_WORKSPACE_DOMAIN,
          scopeKey: templateKey,
          config,
        },
        cmdContext.context,
      );
      return result.data;
    },
    onSuccess: () => invalidate(),
  });

  const publish = useMutation({
    mutationFn: async (changeSummary?: string) => {
      if (!cmdContext) throw new Error("Not authenticated");
      const result = await cmdContext.registry.getServices().configuration.publish(
        {
          domain: OPERATIONS_WORKSPACE_DOMAIN,
          scopeKey: templateKey,
          changeSummary,
        },
        cmdContext.context,
      );
      return result.data;
    },
    onSuccess: () => invalidate(),
  });

  return {
    saveDraft,
    publish,
    isReady: Boolean(cmdContext),
  };
}
