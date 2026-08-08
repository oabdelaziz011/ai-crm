import { useQuery } from "@tanstack/react-query";
import type { OperationsRow } from "@workspace/universal-operations-engine";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { createLoginAppApplicationPorts } from "@/lib/application-layer/create-login-app-application-ports";
import { mapBookingReadModelToRow } from "@/lib/application-layer/operations-queue-row-mapper";
import { useUniversalOperationsConfig } from "@/hooks/universal-operations/use-universal-operations-queue";

/** Live operation context from booking id (Queue `operationId`). */
export function useOperationsEntityBooking(operationId: string | null | undefined, templateKey = "clinic") {
  const { company, user, profile } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const companyId = company?.id ?? profile?.company_id ?? null;
  const configQuery = useUniversalOperationsConfig(templateKey);
  const config = configQuery.data;

  return useQuery({
    queryKey: ["entity-workspace", "operation", companyId, operationId, templateKey],
    enabled: Boolean(companyId && user?.id && operationId && config),
    queryFn: async (): Promise<OperationsRow | null> => {
      if (!companyId || !user?.id || !operationId || !config) return null;
      const ports = createLoginAppApplicationPorts({
        companyId,
        actorUserId: user.id,
        isSuperAdmin,
        hasPermission,
      });
      const booking = await ports.bookingRead.getById(companyId, operationId);
      if (!booking) return null;
      return mapBookingReadModelToRow(booking, config);
    },
  });
}
