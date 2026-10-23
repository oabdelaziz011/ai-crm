import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadAgentToolPorts } from "@workspace/ai-tool-router";
import { nextActionForStatus } from "@workspace/ai-tool-router";
import type { LeadReadModel } from "@workspace/application-layer";
import { extractSalesEvidenceFromConversation, type LeadPlatformServices } from "@workspace/lead-platform";
import type { LoginAppPortContext } from "./adapters/customer-read-port-adapter.js";
import {
  buildToolApplicationContext,
  createLoginAppApplicationServices,
  unwrapCommand,
  unwrapQuery,
} from "./application-layer-tool-context.js";
import {
  buildLeadServiceContext,
  getLoginAppLeadPlatformServices,
} from "@/lib/lead-platform/lead-read-port-adapter";

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

export type ApplicationLayerLeadToolPortDeps = {
  /** Test/DI override — defaults to login-app lead platform (authoritative qualify/merge). */
  platform?: LeadPlatformServices;
  applicationServices?: ReturnType<typeof createLoginAppApplicationServices>;
};

/**
 * Lead AI tools — CRUD/search via Application Layer; qualify/merge/getLead via lead-platform
 * so identity verification and authoritative qualification cannot be skipped.
 */
export function createApplicationLayerLeadToolPorts(
  portContext: LoginAppPortContext,
  client: SupabaseClient,
  deps?: ApplicationLayerLeadToolPortDeps,
): LeadAgentToolPorts {
  const services = deps?.applicationServices ?? createLoginAppApplicationServices(portContext);
  const platform = deps?.platform ?? getLoginAppLeadPlatformServices(client);

  const leadCtx = (userId: string) =>
    buildLeadServiceContext({
      companyId: portContext.companyId,
      actorUserId: userId,
      isSuperAdmin: portContext.isSuperAdmin,
      hasPermission: portContext.hasPermission,
    });

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
      if (input.companyId !== portContext.companyId) {
        throw new Error("Permission denied: company.access");
      }
      const ctx = leadCtx(input.userId);
      let leadId = input.leadId;
      const direct = await platform.queries.getLead(ctx, {
        companyId: portContext.companyId,
        leadId,
      });
      if (!direct.lead || direct.lead.companyId !== portContext.companyId) {
        const byConversation = input.conversationId
          ? await platform.queries.getLeadByConversation(ctx, {
              companyId: portContext.companyId,
              conversationId: input.conversationId,
            })
          : { lead: null };
        const byCustomer = await platform.queries.getLeadByCustomer(ctx, {
          companyId: portContext.companyId,
          customerId: input.leadId,
        });
        const resolved =
          byConversation.lead && byConversation.lead.companyId === portContext.companyId
            ? byConversation.lead
            : byCustomer.lead && byCustomer.lead.companyId === portContext.companyId
              ? byCustomer.lead
              : null;
        if (!resolved) {
          throw new Error(`Lead not found: ${input.leadId}`);
        }
        leadId = resolved.id;
      }
      // AI path: enforce P1a/P1b policy. Follow-up / product-interest remain on lead_qualified publisher.
      const texts = (input.conversationTexts ?? []).filter((text) => text.trim().length > 0);
      const result = await platform.commands.qualifyLead(ctx, {
        companyId: portContext.companyId,
        leadId,
        score: input.score,
        evidence: texts.length > 0 ? extractSalesEvidenceFromConversation(texts) : {},
        qualificationPolicyMode: input.qualificationPolicyMode === "human_override" ? "human_override" : "enforce",
      });
      return {
        lead: result.lead,
        qualificationApplied: result.qualificationApplied,
        policy: result.policy,
      };
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
          lifecycleStatus: "converted",
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
    async getLead(input) {
      if (input.companyId !== portContext.companyId) {
        return { lead: null };
      }
      const { lead } = await platform.queries.getLead(leadCtx(input.userId), {
        companyId: portContext.companyId,
        leadId: input.leadId,
      });
      return { lead };
    },
    async mergeLeads(input) {
      if (input.companyId !== portContext.companyId) {
        throw new Error("Permission denied: company.access");
      }
      const { lead } = await platform.commands.mergeLead(leadCtx(input.userId), {
        companyId: portContext.companyId,
        primaryLeadId: input.primaryLeadId,
        duplicateLeadIds: input.duplicateLeadIds,
      });
      return { lead };
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
      const { lead } = await platform.queries.getLead(leadCtx(input.userId), {
        companyId: portContext.companyId,
        leadId: input.leadId,
      });
      return {
        suggestion: lead ? nextActionForStatus(lead.lifecycleStatus) : "Lead not found.",
        lead,
      };
    },
  };
}
