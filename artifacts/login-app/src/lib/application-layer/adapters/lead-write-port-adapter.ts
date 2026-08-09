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
import { EmployeeIdentityService } from "@/lib/employee-identity/employee-identity-service";
import { mapLeadRecordToReadModel, type LeadEnrichmentLabels } from "./lead-record-mapper.js";
import type { LoginAppPortContext } from "./customer-read-port-adapter.js";
import type { LeadRecord } from "@workspace/lead-platform";
import { getCompanyCurrency } from "@/lib/company-locale/runtime.js";

async function resolveLabels(
  client: SupabaseClient,
  tenantId: string,
  lead: LeadRecord,
): Promise<LeadEnrichmentLabels> {
  const [identity, sourceRow, stageRow] = await Promise.all([
    lead.assignedUserId
      ? EmployeeIdentityService.getById(lead.assignedUserId)
      : Promise.resolve(null),
    lead.sourceId
      ? client
          .from("lead_sources")
          .select("id, name")
          .eq("company_id", tenantId)
          .eq("id", lead.sourceId)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
    client
      .from("lead_stages")
      .select("id, name")
      .eq("company_id", tenantId)
      .eq("id", lead.stageId)
      .maybeSingle()
      .then((r) => r.data),
  ]);

  if (!stageRow?.name) {
    throw new Error(`Stage name missing for stageId=${lead.stageId}`);
  }
  if (lead.assignedUserId && !identity?.fullName) {
    throw new Error(`Owner display name missing for ownerId=${lead.assignedUserId}`);
  }
  if (lead.sourceId && !sourceRow?.name) {
    throw new Error(`Source display name missing for sourceId=${lead.sourceId}`);
  }

  return {
    owner: identity?.fullName ?? null,
    stage: String(stageRow.name),
    source: sourceRow?.name ? String(sourceRow.name) : null,
  };
}

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
      const expectedValue =
        input.expectedValue != null && Number.isFinite(Number(input.expectedValue))
          ? Number(input.expectedValue)
          : undefined;

      const { lead } = await platform.commands.createLead(serviceContext(input.tenantId), {
        companyId: input.tenantId,
        title: input.name,
        contactName: input.contactPerson,
        email: input.email,
        phone: input.phone,
        companyName: input.companyName,
        sourceId: input.sourceId,
        stageId: input.stageId,
        assignedUserId: input.ownerId,
        priority: input.priority as "low" | "normal" | "high" | "urgent" | undefined,
        estimatedValue: expectedValue,
        expectedCloseDate: input.expectedCloseDate,
        temperature: input.temperature,
        notes: input.notes,
        tags: input.tags ? [...input.tags] : undefined,
        pipelineId: input.pipelineId,
        currency: input.currency || getCompanyCurrency(),
      });

      const labels = await resolveLabels(client, input.tenantId, lead);
      return mapLeadRecordToReadModel(lead, input.tenantId, labels);
    },

    async update(tenantId, leadId, patch: LeadUpdateInput) {
      assertTenant(tenantId);
      const { lead } = await platform.commands.updateLead(serviceContext(tenantId), {
        companyId: tenantId,
        leadId,
        title: patch.name,
        contactName: patch.contactPerson,
        email: patch.email ?? undefined,
        phone: patch.phone ?? undefined,
        companyName: patch.companyName ?? undefined,
        priority: patch.priority as "low" | "normal" | "high" | "urgent" | undefined,
        estimatedValue:
          patch.expectedValue != null && Number.isFinite(Number(patch.expectedValue))
            ? Number(patch.expectedValue)
            : undefined,
        score: patch.score,
        sourceId: patch.sourceId,
        stageId: patch.stageId,
        assignedUserId: patch.ownerId,
        expectedCloseDate: patch.expectedCloseDate,
        temperature: patch.temperature,
        notes: patch.notes,
        tags: patch.tags ? [...patch.tags] : undefined,
      });
      const labels = await resolveLabels(client, tenantId, lead);
      return mapLeadRecordToReadModel(lead, tenantId, labels);
    },

    async assign(tenantId, leadId, assigneeUserId, _actorUserId) {
      assertTenant(tenantId);
      const { lead } = await platform.commands.assignLead(serviceContext(tenantId), {
        companyId: tenantId,
        leadId,
        assigneeUserId,
        method: "manual",
      });
      const labels = await resolveLabels(client, tenantId, lead);
      return mapLeadRecordToReadModel(lead, tenantId, labels);
    },

    async changeStage(tenantId, leadId, stageId, _actorUserId) {
      assertTenant(tenantId);
      const { lead } = await platform.commands.changeLeadStage(serviceContext(tenantId), {
        companyId: tenantId,
        leadId,
        stageId,
      });
      const labels = await resolveLabels(client, tenantId, lead);
      return mapLeadRecordToReadModel(lead, tenantId, labels);
    },

    async bulkChangeStage(tenantId, leadIds, stageId, _actorUserId) {
      assertTenant(tenantId);
      const ctxService = serviceContext(tenantId);
      await Promise.all(
        leadIds.map((id) =>
          platform.commands.changeLeadStage(ctxService, {
            companyId: tenantId,
            leadId: id,
            stageId,
          }),
        ),
      );
    },

    async convert(tenantId, leadId, _actorUserId): Promise<LeadConvertResult> {
      assertTenant(tenantId);
      const { lead, customerId, opportunityId } = await platform.commands.convertLead(serviceContext(tenantId), {
        companyId: tenantId,
        leadId,
      });
      const labels = await resolveLabels(client, tenantId, lead);
      return Object.freeze({
        lead: mapLeadRecordToReadModel(lead, tenantId, labels),
        customerId,
        opportunityId: opportunityId ?? null,
      });
    },

    async archive(tenantId, leadId, _actorUserId) {
      assertTenant(tenantId);
      await platform.commands.archiveLead(serviceContext(tenantId), { companyId: tenantId, leadId });
    },
  };
}
