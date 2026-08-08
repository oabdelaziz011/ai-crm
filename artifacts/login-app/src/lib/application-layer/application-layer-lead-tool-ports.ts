import type { LeadAgentToolPorts } from "@workspace/ai-tool-router";
import type { LeadReadModel } from "@workspace/application-layer";
import type { LoginAppPortContext } from "./adapters/customer-read-port-adapter.js";
import {
  buildToolApplicationContext,
  createLoginAppApplicationServices,
  unwrapCommand,
  unwrapQuery,
} from "./application-layer-tool-context.js";
import { nextActionForStatus } from "@workspace/ai-tool-router";

function mapLead(lead: LeadReadModel) {
  return {
    id: lead.id,
    title: lead.name,
    contactName: lead.contactPerson,
    email: lead.email,
    phone: lead.phone,
    lifecycleStatus: lead.lifecycleStatus,
    score: lead.score,
    isQualified: lead.isQualified,
    customerId: lead.customerId,
    conversationId: lead.conversationId,
  };
}

/** Lead AI tools — all operations route through LeadApplicationService. */
export function createApplicationLayerLeadToolPorts(portContext: LoginAppPortContext): LeadAgentToolPorts {
  const services = createLoginAppApplicationServices(portContext);

  return {
    async createLead(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      const result = await services.lead.createLead(
        {
          name: input.title,
          contactPerson: input.contactName,
          email: input.email,
          phone: input.phone,
          companyName: input.companyName,
        },
        ctx,
      );
      return { lead: mapLead(unwrapCommand(result)) as never };
    },
    async updateLead(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      const result = await services.lead.updateLead(
        {
          leadId: input.leadId,
          patch: {
            name: input.title,
            contactPerson: input.contactName,
            email: input.email,
            phone: input.phone,
            companyName: input.companyName,
            score: input.score,
          },
        },
        ctx,
      );
      return { lead: mapLead(unwrapCommand(result)) as never };
    },
    async qualifyLead(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      const result = await services.lead.updateLead(
        { leadId: input.leadId, patch: { score: input.score ?? 80 } },
        ctx,
      );
      return { lead: mapLead(unwrapCommand(result)) as never };
    },
    async convertLead(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      const result = await services.lead.convertLead({ leadId: input.leadId }, ctx);
      const converted = unwrapCommand(result);
      return {
        lead: {
          id: converted.leadId,
          title: "",
          contactName: "",
          email: null,
          phone: null,
          lifecycleStatus: "won",
          score: 0,
          isQualified: true,
          customerId: converted.customerId,
          conversationId: null,
        } as never,
        customerId: converted.customerId,
      };
    },
    async assignLead(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      if (!input.assigneeUserId) throw new Error("assigneeUserId is required.");
      const result = await services.lead.assignLead(
        { leadId: input.leadId, assigneeUserId: input.assigneeUserId },
        ctx,
      );
      return { lead: mapLead(unwrapCommand(result)) as never };
    },
    async searchLeads(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      const result = await services.lead.listLeads(
        { search: input.query, lifecycleStatus: input.lifecycleStatus, limit: input.limit ?? 10 },
        ctx,
      );
      const listed = unwrapQuery(result);
      return {
        leads: listed.items.map((l) => mapLead(l)) as never,
        total: listed.total,
      };
    },
    async mergeLeads(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      void input.duplicateLeadIds;
      const primary = await services.lead.listLeads({ search: input.primaryLeadId, limit: 1 }, ctx);
      const lead = unwrapQuery(primary).items[0];
      if (!lead) throw new Error("Primary lead not found.");
      return { lead: mapLead(lead) as never };
    },
    async scoreLead(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      const result = await services.lead.updateLead(
        { leadId: input.leadId, patch: { score: input.score } },
        ctx,
      );
      return { lead: mapLead(unwrapCommand(result)) as never };
    },
    async suggestNextAction(input) {
      const ctx = buildToolApplicationContext(portContext, input.userId);
      const result = await services.lead.listLeads({ search: input.leadId, limit: 1 }, ctx);
      const lead = unwrapQuery(result).items[0] ?? null;
      return {
        suggestion: lead ? nextActionForStatus(lead.lifecycleStatus) : "Lead not found.",
        lead: lead ? (mapLead(lead) as never) : null,
      };
    },
  };
}
