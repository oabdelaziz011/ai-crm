import { createBuiltinTools } from "./tools/builtin-tools.js";
import { createCreateCustomerTool } from "./tools/create-customer-tool.js";
import { createCrmAgentTools } from "./tools/crm-agent-tools.js";
import type { ToolCustomerServicePort } from "./tools/customer-service-port.js";
import type { CrmAgentToolPorts } from "./tools/crm-agent-ports.js";
import { createToolHandlerRegistry } from "./tools/tool-contract.js";

export type CreateToolRouterServicesOptions = {
  customerService?: ToolCustomerServicePort;
  crmAgentPorts?: CrmAgentToolPorts;
};

export function buildToolHandlers(options?: CreateToolRouterServicesOptions) {
  const handlers = createBuiltinTools();
  if (options?.customerService) {
    handlers.create_customer = createCreateCustomerTool(options.customerService);
  }
  if (options?.crmAgentPorts) {
    Object.assign(handlers, createCrmAgentTools(options.crmAgentPorts));
  }
  return handlers;
}

export function listRegisteredToolHandlerKeys(options?: CreateToolRouterServicesOptions): string[] {
  return Object.keys(buildToolHandlers(options));
}

export function createToolHandlerRegistryFromOptions(options?: CreateToolRouterServicesOptions) {
  return createToolHandlerRegistry(buildToolHandlers(options));
}
