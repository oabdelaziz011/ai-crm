import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createToolRouterServices,
  createRuntimeToolPort,
  createSupabaseCrmAgentToolPorts,
  createTicketAgentToolPortsFromPlatform,
  type CreateToolRouterServicesOptions,
  type ToolRouterServices,
} from "@workspace/ai-tool-router";
import type { RuntimeToolPort } from "@workspace/ai-execution-engine";
import { resolveCompanyActorUserId } from "@workspace/automation-platform";
import { createLoginAppTicketPlatformServices } from "@login-app/lib/ticket-platform/ticket-platform-factory.js";
import { createWebhookToolCustomerServicePort } from "./webhook-tool-customer-service-port.js";
import { createWebhookSchedulingToolPorts } from "./webhook-scheduling-tool-ports.js";
import type { WorkflowTransferToolPorts } from "@workspace/ai-tool-router";

export type WebhookToolRouterIntegrations = {
  toolRouterServices: ToolRouterServices;
  tools: RuntimeToolPort;
  createOptions: CreateToolRouterServicesOptions;
};

export function createWebhookToolRouterIntegrations(
  client: SupabaseClient,
  extras?: {
    workflowTransferPorts?: WorkflowTransferToolPorts;
  },
): WebhookToolRouterIntegrations {
  const customerService = createWebhookToolCustomerServicePort(client);
  const crmAgentPorts = createSupabaseCrmAgentToolPorts(client, {
    resolveActorUserIdForCompany: (companyId) => resolveCompanyActorUserId(client, companyId),
  });
  const schedulingToolPorts = createWebhookSchedulingToolPorts(client);
  const ticketAgentPorts = createTicketAgentToolPortsFromPlatform(
    createLoginAppTicketPlatformServices(client),
  );
  const createOptions: CreateToolRouterServicesOptions = {
    customerService,
    crmAgentPorts,
    schedulingToolPorts,
    ticketAgentPorts,
    ...(extras?.workflowTransferPorts
      ? { workflowTransferPorts: extras.workflowTransferPorts }
      : {}),
  };
  const toolRouterServices = createToolRouterServices(client, createOptions);

  return {
    toolRouterServices,
    tools: createRuntimeToolPort(toolRouterServices, createOptions),
    createOptions,
  };
}
