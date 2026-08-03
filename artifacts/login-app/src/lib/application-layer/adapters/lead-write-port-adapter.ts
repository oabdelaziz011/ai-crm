import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LeadWritePort,
  LeadCreateInput,
  LeadUpdateInput,
  LeadConvertResult,
} from "@workspace/application-layer";
import {
  buildLeadServiceContext,
  getLoginAppLeadPlatformServices,
} from "@/lib/lead-platform/lead-read-port-adapter";
import { mapLeadRecordToReadModel } from "./lead-record-mapper.js";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";

export function createLoginAppLeadWritePort(
  client: SupabaseClient,
  ctx: LoginAppPortContext,
): LeadWritePort {
  const platform = getLoginAppLeadPlatformServices(client);

  const serviceContext = (tenantId: string) =>
    buildLeadServiceContext({
      companyId: tenantId,
      actorUserId: ctx.actorUserId,
      isSuperAdmin: ctx.isSuperAdmin,
      hasPermission: ctx.hasPermission,
    });

  const assertTenant = (tenantId: string) => {
    if (tenantId !== ctx.companyId) throw new Error("Permission denied");
  };

  return {
    async create(input: LeadCreateInput) {
      assertTenant(input.tenantId);
      const { lead } = await platform.commands.createLead(serviceContext(input.tenantId), {
        companyId: input.tenantId,
        title: input.title,
        contactName: input.contactName,
        email: input.email,
        phone: input.phone,
        companyName: input.companyName,
        sourceId: input.sourceId,
        priority: input.priority as "low" | "normal" | "high" | "urgent" | undefined,
        estimatedValue: input.estimatedValue,
        pipelineId: input.pipelineId,
      });
      return mapLeadRecordToReadModel(lead, input.tenantId);
    },

    async update(tenantId, leadId, patch: LeadUpdateInput) {
      assertTenant(tenantId);
      const { lead } = await platform.commands.updateLead(serviceContext(tenantId), {
        companyId: tenantId,
        leadId,
        title: patch.title,
        contactName: patch.contactName,
        email: patch.email ?? undefined,
        phone: patch.phone ?? undefined,
        companyName: patch.companyName ?? undefined,
        priority: patch.priority as "low" | "normal" | "high" | "urgent" | undefined,
        estimatedValue: patch.estimatedValue ?? undefined,
        score: patch.score,
      });
      return mapLeadRecordToReadModel(lead, tenantId);
    },

    async assign(tenantId, leadId, assigneeUserId, _actorUserId) {
      assertTenant(tenantId);
      const { lead } = await platform.commands.assignLead(serviceContext(tenantId), {
        companyId: tenantId,
        leadId,
        assigneeUserId,
        method: "manual",
      });
      return mapLeadRecordToReadModel(lead, tenantId);
    },

    async changeStage(tenantId, leadId, stageId, _actorUserId) {
      assertTenant(tenantId);
      const { lead } = await platform.commands.changeLeadStage(serviceContext(tenantId), {
        companyId: tenantId,
        leadId,
        stageId,
      });
      return mapLeadRecordToReadModel(lead, tenantId);
    },

    async bulkChangeStage(tenantId, leadIds, stageId, _actorUserId) {
      assertTenant(tenantId);
      const ctxService = serviceContext(tenantId);
      await Promise.all(
        leadIds.map((leadId) =>
          platform.commands.changeLeadStage(ctxService, { companyId: tenantId, leadId, stageId }),
        ),
      );
    },

    async convert(tenantId, leadId, _actorUserId): Promise<LeadConvertResult> {
      assertTenant(tenantId);
      const { lead, customerId } = await platform.commands.convertLead(serviceContext(tenantId), {
        companyId: tenantId,
        leadId,
      });
      return Object.freeze({
        lead: mapLeadRecordToReadModel(lead, tenantId),
        customerId,
      });
    },

    async archive(tenantId, leadId, _actorUserId) {
      assertTenant(tenantId);
      await platform.commands.archiveLead(serviceContext(tenantId), { companyId: tenantId, leadId });
    },
  };
}
