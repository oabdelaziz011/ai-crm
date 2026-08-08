import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  buildApplicationContext,
  createLoginAppApplicationLayerRegistry,
  permissionCodes,
} from "@/lib/application-layer/application-layer-bootstrap";

/** Canonical CRM create payload — maps 1:1 to LeadCreateInput (minus tenant/actor). */
export type LeadCreateCommandInput = {
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  sourceId?: string;
  stageId?: string;
  ownerId?: string;
  priority?: string;
  expectedValue?: number;
  expectedCloseDate?: string | null;
  temperature?: "hot" | "warm" | "cold" | null;
  notes?: string;
  tags?: string[];
  pipelineId?: string;
  currency?: string;
};

export type LeadUpdateCommandInput = {
  leadId: string;
  name?: string;
  contactPerson?: string;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  sourceId?: string | null;
  stageId?: string;
  ownerId?: string | null;
  priority?: string;
  expectedValue?: number | null;
  expectedCloseDate?: string | null;
  temperature?: "hot" | "warm" | "cold" | null;
  notes?: string;
  tags?: string[];
};

export function useLeadCommands() {
  const { user, company } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const qc = useQueryClient();

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["leads"] }),
      qc.invalidateQueries({ queryKey: ["lead"] }),
      qc.invalidateQueries({ queryKey: ["leadMetrics"] }),
      qc.invalidateQueries({ queryKey: ["kanban"] }),
      qc.invalidateQueries({ queryKey: ["leads-workspace"] }),
      qc.invalidateQueries({ queryKey: ["lead360-workspace"] }),
      // Convert (and other writes) refresh Customer + Opportunity surfaces.
      qc.invalidateQueries({ queryKey: ["customers"] }),
      qc.invalidateQueries({ queryKey: ["customer"] }),
      qc.invalidateQueries({ queryKey: ["customer360-workspace"] }),
      qc.invalidateQueries({ queryKey: ["opportunities-workspace"] }),
      qc.invalidateQueries({ queryKey: ["opportunity360-workspace"] }),
    ]);
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
      const result = await services.lead.changeStage({ leadId, stageId }, contextFactory());
      if (result && typeof result === "object" && "ok" in result && result.ok === false) {
        throw new Error(
          (result as { error?: { message?: string } }).error?.message || "Stage change failed",
        );
      }
      return result;
    },
    onSuccess: () => invalidate(),
  });

  const assertOk = <T,>(result: T): T => {
    if (result && typeof result === "object" && "ok" in result && (result as { ok: boolean }).ok === false) {
      throw new Error(
        (result as { error?: { message?: string } }).error?.message || "Lead command failed",
      );
    }
    return result;
  };

  const convert = useMutation({
    mutationFn: async ({ leadId }: { leadId: string }) => {
      const services = servicesFactory();
      return assertOk(await services.lead.convertLead({ leadId }, contextFactory()));
    },
    onSuccess: invalidate,
  });

  const assign = useMutation({
    mutationFn: async ({ leadId, ownerId }: { leadId: string; ownerId: string }) => {
      const services = servicesFactory();
      assertOk(await services.lead.assignLead({ leadId, assigneeUserId: ownerId }, contextFactory()));
    },
    onSuccess: invalidate,
  });

  const create = useMutation({
    mutationFn: async (input: LeadCreateCommandInput) => {
      const services = servicesFactory();
      return assertOk(await services.lead.createLead(input, contextFactory()));
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ leadId, ...patch }: LeadUpdateCommandInput) => {
      const services = servicesFactory();
      return assertOk(await services.lead.updateLead({ leadId, patch }, contextFactory()));
    },
    onSuccess: invalidate,
  });

  const archive = useMutation({
    mutationFn: async ({ leadId }: { leadId: string }) => {
      const services = servicesFactory();
      assertOk(await services.lead.archiveLead({ leadId }, contextFactory()));
    },
    onSuccess: invalidate,
  });

  return { changeStage, convert, assign, create, update, archive };
}
