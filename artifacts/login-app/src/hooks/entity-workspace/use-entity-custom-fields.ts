import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import { createLoginAppApplicationPorts } from "@/lib/application-layer/create-login-app-application-ports";

export function useEntityCustomFields(entityType: string, entityId: string) {
  const { company, user, profile } = useAuth();
  const { hasCompanyPermission: hasPermission, isSuperAdmin } = useCompanyPermissionAuth();
  const companyId = company?.id ?? profile?.company_id ?? null;

  return useQuery({
    queryKey: ["entity-workspace", "custom-fields", companyId, entityType, entityId],
    enabled: Boolean(companyId && user?.id && entityType && entityId),
    queryFn: async () => {
      if (!companyId || !user?.id) return [];
      const ports = createLoginAppApplicationPorts({
        companyId,
        actorUserId: user.id,
        isSuperAdmin,
        hasPermission,
      });
      return ports.entityCustomFieldRead.listValues(companyId, entityType, entityId);
    },
  });
}
