import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import type { LoginAppPortContext } from "@/lib/application-layer/adapters/customer-read-port-adapter";

export function useNotificationPortContext(): LoginAppPortContext | null {
  const { user, company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();

  if (!company?.id || !user?.id) return null;

  return {
    companyId: company.id,
    actorUserId: user.id,
    isSuperAdmin,
    hasPermission,
  };
}
