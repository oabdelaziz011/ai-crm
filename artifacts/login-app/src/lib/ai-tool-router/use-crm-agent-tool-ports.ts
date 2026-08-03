import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { usePermissions } from "@/hooks/use-rbac";
import { createCrmAgentToolPorts } from "./crm-agent-adapter";

export function useCrmAgentToolPorts() {
  const { user, profile, isSuperAdmin } = useAuth();
  const { hasPermission } = usePermissions();
  const companyId = profile?.company_id ?? null;

  const portContext = useMemo(() => {
    if (!companyId || !user?.id) return null;
    return {
      companyId,
      actorUserId: user.id,
      isSuperAdmin,
      hasPermission,
    };
  }, [companyId, user?.id, isSuperAdmin, hasPermission]);

  return useMemo(() => {
    if (!portContext) return undefined;
    return createCrmAgentToolPorts({ portContext });
  }, [portContext]);
}
