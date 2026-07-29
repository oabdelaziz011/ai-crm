import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createToolRouterServices,
  createRuntimeToolPort,
  createSupabaseCrmAgentToolPorts,
  type CreateToolRouterServicesOptions,
  type ToolRouterServices,
} from "@workspace/ai-tool-router";
import type { RuntimeToolPort } from "@workspace/ai-execution-engine";
import { resolveCompanyActorUserId } from "@workspace/automation-platform";
import { createWebhookToolCustomerServicePort } from "./webhook-tool-customer-service-port.js";

export type WebhookToolRouterIntegrations = {
  toolRouterServices: ToolRouterServices;
  tools: RuntimeToolPort;
  createOptions: CreateToolRouterServicesOptions;
};

export function createWebhookToolRouterIntegrations(client: SupabaseClient): WebhookToolRouterIntegrations {
  const customerService = createWebhookToolCustomerServicePort(client);
  const crmAgentPorts = createSupabaseCrmAgentToolPorts(client, {
    resolveActorUserIdForCompany: (companyId) => resolveCompanyActorUserId(client, companyId),
  });
  const createOptions: CreateToolRouterServicesOptions = {
    customerService,
    crmAgentPorts,
  };
  const toolRouterServices = createToolRouterServices(client, createOptions);

  return {
    toolRouterServices,
    tools: createRuntimeToolPort(toolRouterServices, createOptions),
    createOptions,
  };
}
