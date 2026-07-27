import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { PortalSettingsRepository } from "@/lib/customer-portal/repositories/portal-settings-repository";
import { PortalCatalogRepository } from "@/lib/customer-portal/repositories/portal-catalog-repository";
import { PortalAuthRepository } from "@/lib/customer-portal/repositories/portal-auth-repository";
import { PublicBookingService } from "@/lib/customer-portal/booking/public-booking-service";
import { PortalAppointmentsService } from "@/lib/customer-portal/appointments/portal-appointments-service";
import { PortalCheckInService } from "@/lib/customer-portal/appointments/portal-check-in-service";
import { PortalDocumentsService } from "@/lib/customer-portal/documents/portal-documents-service";
import { PortalProfileService } from "@/lib/customer-portal/profile/portal-profile-service";
import { PortalAnalyticsService } from "@/lib/customer-portal/selectors/portal-analytics-service";
import { PortalTimelineService } from "@/lib/customer-portal/selectors/portal-timeline-service";
import { PortalPaymentService } from "@/lib/customer-portal/payments/portal-payment-service";

export type CustomerPortalServices = {
  settings: PortalSettingsRepository;
  catalog: PortalCatalogRepository;
  auth: PortalAuthRepository;
  booking: PublicBookingService;
  appointments: PortalAppointmentsService;
  checkIn: PortalCheckInService;
  documents: PortalDocumentsService;
  profile: PortalProfileService;
  analytics: PortalAnalyticsService;
  timeline: PortalTimelineService;
  payments: PortalPaymentService;
};

export function createCustomerPortalServices(client: SupabaseClient = supabase): CustomerPortalServices {
  return {
    settings: new PortalSettingsRepository(client),
    catalog: new PortalCatalogRepository(client),
    auth: new PortalAuthRepository(client),
    booking: new PublicBookingService(client),
    appointments: new PortalAppointmentsService(client),
    checkIn: new PortalCheckInService(client),
    documents: new PortalDocumentsService(client),
    profile: new PortalProfileService(client),
    analytics: new PortalAnalyticsService(client),
    timeline: new PortalTimelineService(),
    payments: PortalPaymentService.createDefault(),
  };
}

let cached: CustomerPortalServices | null = null;

export function getCustomerPortalServices(): CustomerPortalServices {
  if (!cached) cached = createCustomerPortalServices();
  return cached;
}
