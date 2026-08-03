import type { CrmKnowledgeRetriever } from "@workspace/ai-tool-router";
import type { LoginAppPortContext } from "@/lib/application-layer/adapters/customer-read-port-adapter";
import { createApplicationLayerCrmAgentToolPorts } from "@/lib/application-layer/application-layer-crm-agent-tool-ports.js";

export type { CrmKnowledgeRetriever };

export type CreateCrmAgentToolPortsOptions = {
  portContext: LoginAppPortContext;
  retrieveKnowledge?: CrmKnowledgeRetriever;
};

/** CRM agent tool ports — Application Layer only for domain reads/writes. */
export function createCrmAgentToolPorts(options: CreateCrmAgentToolPortsOptions) {
  return createApplicationLayerCrmAgentToolPorts(options);
}
