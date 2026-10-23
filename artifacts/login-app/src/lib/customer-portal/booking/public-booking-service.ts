import type { SupabaseClient } from "@supabase/supabase-js";
import { isImportPhoneWritable, resolveImportPhoneIdentity } from "@workspace/ai-tool-router";
import { getBookingDomainServices } from "@/lib/scheduling/booking-domain";
import { getSchedulingServices } from "@/lib/scheduling";
import type {
  PortalBookingRequest,
  PortalBookingResult,
  PortalPolicySnapshot,
  PortalSlotView,
} from "@/lib/customer-portal/types";
import { PortalAuthRepository } from "@/lib/customer-portal/repositories/portal-auth-repository";
import { portalBookingRateLimiter } from "@/lib/customer-portal/security/portal-rate-limiter";

/** Public booking orchestration — delegates to BookingDomainService. */
export class PublicBookingService {
  private readonly authRepo: PortalAuthRepository;

  constructor(private readonly client: SupabaseClient) {
    this.authRepo = new PortalAuthRepository(client);
  }

  async getAvailableSlots(
    companyId: string,
    resourceId: string,
    serviceId: string,
    date: string,
    durationMinutes?: number | null,
  ): Promise<PortalSlotView[]> {
    const scheduling = getSchedulingServices();
    const resolved = await scheduling.slotGenerationEngine.getAvailableSlots(
      companyId,
      resourceId,
      serviceId,
      date,
      {
        respectBookingRules: true,
        durationMinutes: durationMinutes && durationMinutes > 0 ? durationMinutes : undefined,
      },
    );
    return resolved.slots.map((startTime) => ({
      startTime,
      endTime: startTime,
      available: true,
    }));
  }

  async getPolicies(companyId: string): Promise<PortalPolicySnapshot> {
    const { data } = await this.client
      .from("scheduling_booking_rules")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    const { data: holidays } = await this.client
      .from("scheduling_holidays")
      .select("holiday_date")
      .eq("company_id", companyId);

    return {
      minBookingNoticeMinutes: data?.min_booking_notice_minutes ?? 0,
      maxAdvanceBookingDays: data?.max_booking_window_days ?? 90,
      minCancellationNoticeMinutes: data?.min_cancellation_notice_minutes ?? 0,
      minRescheduleNoticeMinutes: data?.min_reschedule_notice_minutes ?? 0,
      maxActiveBookingsPerCustomer: 10,
      blackoutDates: (holidays ?? []).map((h) => h.holiday_date),
    };
  }

  async createBooking(
    request: PortalBookingRequest,
    ownerUserId?: string | null,
  ): Promise<PortalBookingResult> {
    const phonePreview = resolveImportPhoneIdentity({
      phone: request.customer.phone,
      rowRegion: request.customer.phoneRegion ?? null,
      source: "explicit",
    });
    if (!isImportPhoneWritable(phonePreview) || !phonePreview.identity?.phone_e164) {
      throw new Error("INVALID_PHONE");
    }

    const rateKey = `${request.companyId}:${phonePreview.identity.phone_e164}`;
    if (!portalBookingRateLimiter.isAllowed(rateKey)) {
      throw new Error("Too many booking attempts. Please try again later.");
    }

    const customerId = await this.authRepo.upsertCustomer(
      request.companyId,
      request.customer,
      ownerUserId ?? null,
    );

    const domain = getBookingDomainServices();
    const validation = await domain.bookingDomain.validateBooking({
      companyId: request.companyId,
      customerId,
      resourceId: request.resourceId,
      serviceId: request.serviceId,
      date: request.date,
      slotStart: request.slotStart,
      pricingRuleId: request.pricingRuleId,
      visitType: request.visitType,
    });

    if (!validation.valid) {
      throw new Error(validation.errors.join(", "));
    }

    const result = await domain.bookingDomain.createBooking({
      companyId: request.companyId,
      customerId,
      resourceId: request.resourceId,
      serviceId: request.serviceId,
      date: request.date,
      slotStart: request.slotStart,
      source: "public_booking",
      notes: request.notes ?? null,
      branchId: request.branchId ?? null,
      pricingRuleId: request.pricingRuleId,
      visitType: request.visitType,
      createdBy: null,
    });

    await this.client.from("portal_analytics_events").insert({
      company_id: request.companyId,
      event_type: "booking_completed",
      metadata: { bookingId: result.booking.id, source: "public_booking" },
    });

    return {
      bookingId: result.booking.id,
      customerId,
      status: result.booking.status,
      startAt: result.booking.start_at,
      endAt: result.booking.end_at,
    };
  }
}
