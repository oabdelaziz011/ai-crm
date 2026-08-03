import type { HandoffReadPort } from "../ports/handoff-read-port.js";
import type { HandoffQueryService } from "../services/handoff-query-service.js";
import type { HandoffReadAccessContext } from "../ports/handoff-read-port.js";

export function createHandoffReadPort(queries: HandoffQueryService): HandoffReadPort {
  return {
    getOwnership: (access, input) => queries.getOwnership(access, input),
    getOwnershipHistory: (access, input) => queries.getOwnershipHistory(access, input),
    getAgentWorkspace: (access, input) => queries.getAgentWorkspace(access, input),
    listQueues: (access, input) => queries.listQueues(access, input),
    getQueuePosition: (access, input) => queries.getQueuePosition(access, input),
    listPendingRequests: (access, input) => queries.listPendingRequests(access, input),
    getAgentPresence: (access, input) => queries.getAgentPresence(access, input),
    listAgentPresence: (access, input) => queries.listAgentPresence(access, input),
    listEscalationRules: (access, input) => queries.listEscalationRules(access, input),
    fetchMetrics: (access, input) => queries.fetchMetrics(access, input),
  };
}

export type { HandoffReadAccessContext };
