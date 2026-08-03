import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "@/lib/application-layer/application-layer-bootstrap";

export function useLeadCommands() {
  const { user, company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const qc = useQueryClient();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["leads-workspace"] });
    void qc.invalidateQueries({ queryKey: ["lead360-workspace"] });
  };

  const contextFactory = () => {
    if (!company?.id || !user?.id) throw new Error("Not authenticated");
    return buildApplicationContext({
      tenantId: company.id,
      actorId: user.id,
      permissions: permissionCodes(hasPermission, isSuperAdmin),
    });
  };

  const servicesFactory = () => {
    if (!company?.id || !user?.id) throw new Error("Not authenticated");
    return createLoginAppApplicationLayerRegistry({
      companyId: company.id,
      actorUserId: user.id,
      isSuperAdmin,
      hasPermission,
    }).getServices();
  };

  const changeStage = useMutation({
    mutationFn: async ({ leadId, stageId }: { leadId: string; stageId: string }) => {
      const services = servicesFactory();
      await services.lead.changeStage({ leadId, stageId }, contextFactory());
    },
    onSuccess: invalidate,
  });

  const convert = useMutation({
    mutationFn: async ({ leadId }: { leadId: string }) => {
      const services = servicesFactory();
      return services.lead.convertLead({ leadId }, contextFactory());
    },
    onSuccess: invalidate,
  });

  const assign = useMutation({
    mutationFn: async ({ leadId, assigneeUserId }: { leadId: string; assigneeUserId: string }) => {
      const services = servicesFactory();
      await services.lead.assignLead({ leadId, assigneeUserId }, contextFactory());
    },
    onSuccess: invalidate,
  });

  return { changeStage, convert, assign };
}
