import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAutomationPlatformServices,
  createSupabaseBookingServicePort,
  createSupabaseConversationCustomerLinkPort,
  createSupabaseCustomerServicePort,
  resolveCompanyActorUserId,
  type AutomationPlatformServices,
} from "@workspace/automation-platform";

export function createWebhookAutomationPlatformServices(client: SupabaseClient): AutomationPlatformServices {
  const resolveActor = (companyId: string) => resolveCompanyActorUserId(client, companyId);
  const customerService = createSupabaseCustomerServicePort(client, {
    resolveActorUserIdForCompany: resolveActor,
  });
  const bookingService = createSupabaseBookingServicePort(client, {
    resolveActorUserIdForCompany: resolveActor,
  });
  const conversationCustomerLink = createSupabaseConversationCustomerLinkPort(client);

  return createAutomationPlatformServices(client, {
    actionDeps: { customerService, bookingService, conversationCustomerLink },
  });
}

/** Identifies the webhook runtime dependency graph for deployment verification. */
export const WEBHOOK_RUNTIME_FEATURES = {
  customerService: true,
  bookingService: true,
  conversationCustomerLink: true,
  factory: "createWebhookAutomationPlatformServices",
} as const;
