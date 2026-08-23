import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createLeadPlatformServices,
  LEAD_PERMISSIONS,
  type LeadPlatformServices,
  type LeadServiceContext,
} from "@workspace/lead-platform";
import type { LeadAgentToolPorts } from "../tools/lead-agent-ports.js";
import { nextActionForStatus } from "../tools/lead-agent-tools.js";

/**
 * Domain-layer permissions after ToolRouter + commercial gates.
 * Constrained allowlist — not isSuperAdmin and not blanket () => true.
 */
const LEAD_AGENT_DOMAIN_PERMISSIONS: ReadonlySet<string> = new Set([
  LEAD_PERMISSIONS.view,
  LEAD_PERMISSIONS.create,
  LEAD_PERMISSIONS.edit,
  LEAD_PERMISSIONS.qualify,
  LEAD_PERMISSIONS.convert,
  LEAD_PERMISSIONS.assign,
  LEAD_PERMISSIONS.merge,
  LEAD_PERMISSIONS.archive,
  LEAD_PERMISSIONS.manage,
]);

function buildToolContext(userId: string, companyId: string): LeadServiceContext {
  return {
    userId,
    companyId,
    isSuperAdmin: false,
    hasPermission: (code: string) => LEAD_AGENT_DOMAIN_PERMISSIONS.has(code),
  };
}

export function createLeadAgentToolPortsFromPlatform(platform: LeadPlatformServices): LeadAgentToolPorts {
  const { commands, queries } = platform;

  return {
    createLead(input) {
      return commands.createLead(buildToolContext(input.userId, input.companyId), input);
    },
    updateLead(input) {
      return commands.updateLead(buildToolContext(input.userId, input.companyId), input);
    },
    qualifyLead(input) {
      return commands.qualifyLead(buildToolContext(input.userId, input.companyId), input);
    },
    convertLead(input) {
      return commands.convertLead(buildToolContext(input.userId, input.companyId), input);
    },
    assignLead(input) {
      return commands.assignLead(buildToolContext(input.userId, input.companyId), {
        companyId: input.companyId,
        leadId: input.leadId,
        assigneeUserId: input.assigneeUserId,
        method: input.assignmentMethod as never,
      });
    },
    searchLeads(input) {
      return queries.searchLeads(buildToolContext(input.userId, input.companyId), {
        companyId: input.companyId,
        query: input.query,
        lifecycleStatus: input.lifecycleStatus,
        limit: input.limit ?? 10,
        offset: 0,
      });
    },
    mergeLeads(input) {
      return commands.mergeLead(buildToolContext(input.userId, input.companyId), input);
    },
    scoreLead(input) {
      return commands.updateLead(buildToolContext(input.userId, input.companyId), {
        companyId: input.companyId,
        leadId: input.leadId,
        score: input.score,
      });
    },
    async suggestNextAction(input) {
      const lead = await queries.getLead(buildToolContext(input.userId, input.companyId), {
        companyId: input.companyId,
        leadId: input.leadId,
      });
      return {
        suggestion: lead.lead ? nextActionForStatus(lead.lead.lifecycleStatus) : "Lead not found.",
        lead: lead.lead,
      };
    },
  };
}

export function createSupabaseLeadAgentToolPorts(client: SupabaseClient): LeadAgentToolPorts {
  return createLeadAgentToolPortsFromPlatform(createLeadPlatformServices(client));
}
