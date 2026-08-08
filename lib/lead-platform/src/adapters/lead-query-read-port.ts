import type { LeadReadPort } from "../ports/lead-read-port.js";
import type { LeadQueryService } from "../services/lead-query-service.js";

export function createLeadReadPort(queries: LeadQueryService): LeadReadPort {
  return {
    getLead: (access, input) => queries.getLead(access, input),
    getLeadByConversation: (access, input) => queries.getLeadByConversation(access, input),
    getLeadByCustomer: (access, input) => queries.getLeadByCustomer(access, input),
    searchLeads: (access, input) => queries.searchLeads(access, input),
    listPipeline: (access, input) => queries.listPipeline(access, input),
    listStages: (access, input) => queries.listStages(access, input),
    listPipelines: (access, input) => queries.listPipelines(access, input),
    listSources: (access, input) => queries.listSources(access, input),
    listLeadActivities: (access, input) => queries.listLeadActivities(access, input),
    listLeadHistory: (access, input) => queries.listLeadHistory(access, input),
    listLeadNotes: (access, input) => queries.listLeadNotes(access, input),
    listLeadTags: (access, input) => queries.listLeadTags(access, input),
    listAssignedLeads: (access, input) => queries.listAssignedLeads(access, input),
    listCompanyLeads: (access, input) => queries.listCompanyLeads(access, input),
    fetchPipelineMetrics: (access, input) => queries.fetchPipelineMetrics(access, input),
    fetchForecastMetrics: (access, input) => queries.fetchForecastMetrics(access, input),
    fetchDashboardMetrics: (access, input) => queries.fetchDashboardMetrics(access, input),
  };
}
