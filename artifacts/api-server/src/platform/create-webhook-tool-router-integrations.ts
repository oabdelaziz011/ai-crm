import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createToolRouterServices,
  createRuntimeToolPort,
  createSupabaseCrmAgentToolPorts,
  createHandoffAgentToolPorts,
  createLeadAgentToolPortsFromPlatform,
  createTicketAgentToolPortsFromPlatform,
  type CreateToolRouterServicesOptions,
  type CrmKnowledgeRetriever,
  type ToolRouterServices,
} from "@workspace/ai-tool-router";
import type { RuntimeToolPort } from "@workspace/ai-execution-engine";
import { resolveCompanyActorUserId } from "@workspace/automation-platform";
import {
  createSupabaseTicketAuditPort,
  createTicketPlatformServices,
} from "@workspace/ticket-platform";
import { createLoginAppLeadPlatformServices } from "@login-app/lib/lead-platform/lead-platform-factory.js";
import { createWebhookToolCustomerServicePort } from "./webhook-tool-customer-service-port.js";
import { createWebhookHandoffPlatformForTools } from "./create-webhook-handoff-platform.js";
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
    /** Phase 5K.1 — RAG via KnowledgeRuntimeProvider; required for real knowledge_search. */
    retrieveKnowledge?: CrmKnowledgeRetriever;
  },
): WebhookToolRouterIntegrations {
  const customerService = createWebhookToolCustomerServicePort(client);
  const crmAgentPorts = createSupabaseCrmAgentToolPorts(client, {
    resolveActorUserIdForCompany: (companyId) => resolveCompanyActorUserId(client, companyId),
    retrieveKnowledge: extras?.retrieveKnowledge,
  });
  const schedulingToolPorts = createWebhookSchedulingToolPorts(client);
  // Use service-role ticket platform only. Do NOT use login-app event/notification bridges here —
  // those default to the browser publishable Supabase client and fail with
  // "permission denied for function current_company_id" after the ticket row is already inserted.
  const ticketAgentPorts = createTicketAgentToolPortsFromPlatform(
    createTicketPlatformServices(client, {
      audit: createSupabaseTicketAuditPort(client),
    }),
  );
  const handoffAgentPorts = createHandoffAgentToolPorts(client, {
    platform: createWebhookHandoffPlatformForTools(client),
    resolveActorUserIdForCompany: (companyId) => resolveCompanyActorUserId(client, companyId),
  });
  const leadAgentPorts = createLeadAgentToolPortsFromPlatform(
    createLoginAppLeadPlatformServices(client),
  );
  const createOptions: CreateToolRouterServicesOptions = {
    customerService,
    crmAgentPorts,
    schedulingToolPorts,
    ticketAgentPorts,
    handoffAgentPorts,
    leadAgentPorts,
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
