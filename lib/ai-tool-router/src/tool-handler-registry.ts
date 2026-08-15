import { createBuiltinTools } from "./tools/builtin-tools.js";
import { createCreateCustomerTool } from "./tools/create-customer-tool.js";
import { createCrmAgentTools } from "./tools/crm-agent-tools.js";
import { createSchedulingAgentTools } from "./tools/scheduling-agent-tools.js";
import { createTicketAgentTools } from "./tools/ticket-agent-tools.js";
import { createLeadAgentTools } from "./tools/lead-agent-tools.js";
import { createHandoffAgentTools } from "./tools/handoff-agent-tools.js";
import { createWorkflowTransferTools } from "./tools/workflow-transfer-tools.js";
import type { ToolCustomerServicePort } from "./tools/customer-service-port.js";
import type { CrmAgentToolPorts } from "./tools/crm-agent-ports.js";
import type { SchedulingToolPorts } from "./tools/scheduling-agent-ports.js";
import type { TicketAgentToolPorts } from "./tools/ticket-agent-ports.js";
import type { LeadAgentToolPorts } from "./tools/lead-agent-ports.js";
import type { HandoffAgentToolPorts } from "./tools/handoff-agent-ports.js";
import type { WorkflowTransferToolPorts } from "./tools/workflow-transfer-tools.js";
import type { Tool } from "./tools/tool-contract.js";
import { createToolHandlerRegistry } from "./tools/tool-contract.js";

export type CreateToolRouterServicesOptions = {
  customerService?: ToolCustomerServicePort;
  crmAgentPorts?: CrmAgentToolPorts;
  schedulingToolPorts?: SchedulingToolPorts;
  ticketAgentPorts?: TicketAgentToolPorts;
  leadAgentPorts?: LeadAgentToolPorts;
  handoffAgentPorts?: HandoffAgentToolPorts;
  workflowTransferPorts?: WorkflowTransferToolPorts;
  /** When false (default), mock builtin tools are excluded from production registration. */
  includeMockTools?: boolean;
};

export function buildToolHandlers(options?: CreateToolRouterServicesOptions) {
  const handlers: Record<string, Tool> = options?.includeMockTools ? createBuiltinTools() : {};
  if (options?.customerService) {
    handlers.create_customer = createCreateCustomerTool(options.customerService);
  }
  if (options?.crmAgentPorts) {
    Object.assign(handlers, createCrmAgentTools(options.crmAgentPorts));
  }
  if (options?.schedulingToolPorts) {
    Object.assign(handlers, createSchedulingAgentTools(options.schedulingToolPorts));
  }
  if (options?.ticketAgentPorts) {
    Object.assign(handlers, createTicketAgentTools(options.ticketAgentPorts));
  }
  if (options?.leadAgentPorts) {
    Object.assign(handlers, createLeadAgentTools(options.leadAgentPorts));
  }
  if (options?.handoffAgentPorts) {
    Object.assign(handlers, createHandoffAgentTools(options.handoffAgentPorts));
  }
  if (options?.workflowTransferPorts) {
    Object.assign(handlers, createWorkflowTransferTools(options.workflowTransferPorts));
  }
  return handlers;
}

export function listRegisteredToolHandlerKeys(options?: CreateToolRouterServicesOptions): string[] {
  return Object.keys(buildToolHandlers(options));
}

export function createToolHandlerRegistryFromOptions(options?: CreateToolRouterServicesOptions) {
  return createToolHandlerRegistry(buildToolHandlers(options));
}
