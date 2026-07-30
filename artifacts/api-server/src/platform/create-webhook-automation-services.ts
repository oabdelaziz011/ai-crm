import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAutomationPlatformServices,
  createSupabaseConversationCustomerLinkPort,
  createSupabaseCustomerServicePort,
  resolveCompanyActorUserId,
  type AutomationPlatformServices,
} from "@workspace/automation-platform";
import { createLookupOptionsPort } from "@login-app/lib/lookups/create-lookup-options-port.js";
import { createBusinessCalendarPort } from "@login-app/lib/scheduling/business-calendar/create-business-calendar-port.js";
import { createSchedulingAwareBookingServicePort } from "@login-app/lib/booking/automation-booking-adapter.js";

export function createWebhookAutomationPlatformServices(client: SupabaseClient): AutomationPlatformServices {
  const resolveActor = (companyId: string) => resolveCompanyActorUserId(client, companyId);
  const customerService = createSupabaseCustomerServicePort(client, {
    resolveActorUserIdForCompany: resolveActor,
  });
  const bookingService = createSchedulingAwareBookingServicePort(client, {
    resolveActorUserIdForCompany: resolveActor,
  });
  const conversationCustomerLink = createSupabaseConversationCustomerLinkPort(client);
  const lookupOptions = createLookupOptionsPort(client);
  const businessCalendar = createBusinessCalendarPort(client);

  return createAutomationPlatformServices(client, {
    actionDeps: { customerService, bookingService, conversationCustomerLink, lookupOptions, businessCalendar },
  });
}

/** Identifies the webhook runtime dependency graph for deployment verification. */
export const WEBHOOK_RUNTIME_FEATURES = {
  customerService: true,
  bookingService: true,
  conversationCustomerLink: true,
  lookupOptions: true,
  businessCalendar: true,
  factory: "createWebhookAutomationPlatformServices",
} as const;
