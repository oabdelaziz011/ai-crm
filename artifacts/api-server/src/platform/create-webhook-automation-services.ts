import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnterpriseRuntimeLike } from "@workspace/ai-workflow-platform";
import type { KnowledgeProvider } from "@workspace/retrieval-engine";
import {
  createAutomationPlatformServices,
  createSupabaseConversationCustomerLinkPort,
  createSupabaseCustomerServicePort,
  resolveCompanyActorUserId,
  wxRecordDependencyConstruction,
  wxRecordServiceResolution,
  type AutomationPlatformServices,
} from "@workspace/automation-platform";
import { createLookupOptionsPort } from "@login-app/lib/lookups/create-lookup-options-port.js";
import { createBusinessCalendarPort } from "@login-app/lib/scheduling/business-calendar/create-business-calendar-port.js";
import { createSchedulingAwareBookingServicePort } from "@login-app/lib/booking/automation-booking-adapter.js";
import { createAutomationTicketServicePort } from "@login-app/lib/tickets/automation-ticket-adapter.js";
import { createWebhookAIWorkflowAutomationRegistry } from "./webhook-ai-workflow-bridge.js";

export type WebhookAutomationAIOptions = {
  enterpriseRuntime: EnterpriseRuntimeLike;
  knowledge?: KnowledgeProvider;
};

export function createWebhookAutomationPlatformServices(
  client: SupabaseClient,
  ai?: WebhookAutomationAIOptions,
): AutomationPlatformServices {
  wxRecordServiceResolution("createWebhookAutomationPlatformServices");
  const resolveActor = (companyId: string) => resolveCompanyActorUserId(client, companyId);

  wxRecordDependencyConstruction("createSupabaseCustomerServicePort");
  const customerService = createSupabaseCustomerServicePort(client, {
    resolveActorUserIdForCompany: resolveActor,
  });

  wxRecordDependencyConstruction("createSchedulingAwareBookingServicePort");
  const bookingService = createSchedulingAwareBookingServicePort(client, {
    resolveActorUserIdForCompany: resolveActor,
  });

  wxRecordDependencyConstruction("createSupabaseConversationCustomerLinkPort");
  const conversationCustomerLink = createSupabaseConversationCustomerLinkPort(client);

  wxRecordDependencyConstruction("createLookupOptionsPort");
  const lookupOptions = createLookupOptionsPort(client);

  wxRecordDependencyConstruction("createBusinessCalendarPort");
  const businessCalendar = createBusinessCalendarPort(client);

  wxRecordDependencyConstruction("createAutomationTicketServicePort");
  const ticketService = createAutomationTicketServicePort(client, {
    resolveActorUserIdForCompany: resolveActor,
  });

  const actionDeps = {
    customerService,
    bookingService,
    conversationCustomerLink,
    lookupOptions,
    businessCalendar,
    ticketService,
  };

  if (!ai?.enterpriseRuntime) {
    return createAutomationPlatformServices(client, { actionDeps });
  }

  wxRecordDependencyConstruction("createWebhookAIWorkflowAutomationRegistry");
  const registry = createWebhookAIWorkflowAutomationRegistry({
    actionDeps,
    enterpriseRuntime: ai.enterpriseRuntime,
    knowledge: ai.knowledge,
  });

  return createAutomationPlatformServices(client, {
    actionDeps,
    registry,
  });
}

/** Identifies the webhook runtime dependency graph for deployment verification. */
export const WEBHOOK_RUNTIME_FEATURES = {
  customerService: true,
  bookingService: true,
  conversationCustomerLink: true,
  lookupOptions: true,
  businessCalendar: true,
  ticketService: true,
  aiWorkflowNodes: true,
  factory: "createWebhookAutomationPlatformServices",
} as const;
