import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "@/lib/application-layer/application-layer-bootstrap";
import { invalidateOperationsPlatformQueries } from "@/lib/application-layer/operations-platform-sync";

const OPERATIONS_WORKSPACE_DOMAIN = "operations.workspace";

function useConfigurationCommandContext() {
  const { user, company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();

  if (!company?.id || !user?.id) return null;

  const portContext = {
    companyId: company.id,
    actorUserId: user.id,
    isSuperAdmin,
    hasPermission,
  };

  const registry = createLoginAppApplicationLayerRegistry(portContext);
  const context = buildApplicationContext({
    tenantId: company.id,
    actorId: user.id,
    permissions: permissionCodes(hasPermission, isSuperAdmin),
  });

  return { registry, context, companyId: company.id };
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
