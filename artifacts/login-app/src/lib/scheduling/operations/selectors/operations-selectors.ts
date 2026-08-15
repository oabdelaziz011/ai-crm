import type {
  OperationsBookingView,
  OperationsFilters,
  OperationsKpiSnapshot,
  OperationsDailyStats,
  OperationsTimelineSlot,
} from "@/lib/scheduling/operations/types";
import type { OperationsBookingRecord } from "@/lib/scheduling/operations/repositories";
import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";
import { statusToTimelineKind } from "@/lib/scheduling/operations/utilities";

export function mapRecordToOperationsBooking(
  record: OperationsBookingRecord,
  displayTimezone = record.timezone,
): OperationsBookingView {
  const start = TimezoneResolver.parseInstant(record.start_at);
  const end = TimezoneResolver.parseInstant(record.end_at);
  const durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000));

  const servicePriceCents = Number(record.scheduling_services?.price_cents) || 0;
  const serviceCurrency =
    String(record.scheduling_services?.currency ?? "USD")
      .trim()
      .toUpperCase() || "USD";
  // Amount / currency for queue & payment: booking snapshot only — never recalculate from Service.
  const amountCents = record.amount_cents != null ? Number(record.amount_cents) : 0;
  const paymentRaw = String(record.payment_status ?? "").toLowerCase();
  const paymentStatus =
    paymentRaw === "paid" ||
    paymentRaw === "partial" ||
    paymentRaw === "pending" ||
    paymentRaw === "refunded" ||
    paymentRaw === "cancelled"
      ? (paymentRaw as OperationsBookingView["paymentStatus"])
      : record.status === "completed"
        ? "paid"
        : "pending";

  return {
    id: record.id,
    companyId: record.company_id,
    branchId: record.branch_id,
    customerId: record.customer_id,
    resourceId: record.resource_id,
    serviceId: record.service_id,
    startAt: record.start_at,
    endAt: record.end_at,
    timezone: record.timezone,
    status: record.status,
    notes: record.notes,
    createdBy: record.created_by,
    createdAt: record.created_at ?? record.start_at,
    updatedAt: record.updated_at ?? record.start_at,
    customer: record.customers
      ? {
          id: record.customers.id,
          name: record.customers.name,
          phone: record.customers.phone ?? null,
          email: record.customers.email ?? null,
        }
      : null,
    service: record.scheduling_services
      ? {
          id: record.scheduling_services.id,
          name: record.scheduling_services.name,
          durationMinutes: record.scheduling_services.duration_minutes,
          priceCents: servicePriceCents,
          currency: serviceCurrency,
        }
      : null,
    resource: record.scheduling_resources
      ? {
          id: record.scheduling_resources.id,
          name: record.scheduling_resources.name,
          type: record.scheduling_resources.resource_type,
        }
      : null,
    branch: record.branches ? { id: record.branches.id, name: record.branches.name } : null,
    paymentStatus,
    amountCents,
    currency: String(record.currency ?? "USD").trim().toUpperCase() || "USD",
    visitType: String(record.visit_type ?? "Unknown").trim() || "Unknown",
    discountCents: Number(record.discount_cents) || 0,
    taxCents: Number(record.tax_cents) || 0,
    invoiceId: record.invoice_id ?? null,
    confirmationNumber:
      typeof record.confirmation_number === "string" && record.confirmation_number.trim()
        ? record.confirmation_number.trim()
        : null,
    displayStart: TimezoneResolver.localTimeForInstant(start, displayTimezone),
    displayEnd: TimezoneResolver.localTimeForInstant(end, displayTimezone),
    durationMinutes,
  };
}

export function filterOperationsBookings(
  bookings: OperationsBookingView[],
  filters: OperationsFilters,
): OperationsBookingView[] {
  const search = filters.search.trim().toLowerCase();
  if (!search) return bookings;

  return bookings.filter((booking) => {
    const haystack = [
      booking.customer?.name,
      booking.customer?.phone,
      booking.id,
      booking.confirmationNumber,
      booking.service?.name,
      booking.resource?.name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });
}

export function computeOperationsKpis(
  bookings: OperationsBookingView[],
  timelineSlots: OperationsTimelineSlot[],
): OperationsKpiSnapshot {
  const activeBookings = bookings.filter(
    (b) => !["cancelled", "no_show", "rescheduled"].includes(b.status),
  );
  const bookedSlots = timelineSlots.filter((slot) => slot.kind !== "available").length;
  const availableSlots = timelineSlots.filter((slot) => slot.kind === "available").length;
  const totalSlots = timelineSlots.length;

  const expectedRevenueCents = activeBookings
    .filter((b) => ["pending", "confirmed", "checked_in"].includes(b.status))
    .reduce((sum, b) => sum + (b.amountCents ?? b.service?.priceCents ?? 0), 0);

  const actualRevenueCents = bookings
    .filter((b) => b.paymentStatus === "paid" || b.status === "completed")
    .reduce((sum, b) => sum + (b.amountCents ?? b.service?.priceCents ?? 0), 0);

  return {
    bookings: activeBookings.length,
    availableSlots,
    cancelled: bookings.filter((b) => b.status === "cancelled").length,
    completed: bookings.filter((b) => b.status === "completed").length,
    checkedIn: bookings.filter((b) => b.status === "checked_in").length,
    occupancyPercent: totalSlots > 0 ? Math.round((bookedSlots / totalSlots) * 100) : 0,
    expectedRevenueCents,
    actualRevenueCents,
  };
}

export function computeDailyStats(
  bookings: OperationsBookingView[],
  timelineSlots: OperationsTimelineSlot[],
): OperationsDailyStats {
  const kpis = computeOperationsKpis(bookings, timelineSlots);
  const durations = bookings
    .filter((b) => !["cancelled", "rescheduled"].includes(b.status))
    .map((b) => b.durationMinutes);

  const averageDurationMinutes =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

  const checkedInBookings = bookings.filter((b) => b.status === "checked_in");
  const waitingMinutes = checkedInBookings.map((b) => {
    const start = new Date(b.startAt).getTime();
    const updated = new Date(b.updatedAt).getTime();
    return Math.max(0, Math.round((updated - start) / 60_000));
  });

  const averageWaitingMinutes =
    waitingMinutes.length > 0
      ? Math.round(waitingMinutes.reduce((a, b) => a + b, 0) / waitingMinutes.length)
      : 0;

  return {
    totalBookings: kpis.bookings,
    completed: kpis.completed,
    cancelled: kpis.cancelled,
    noShow: bookings.filter((b) => b.status === "no_show").length,
    available: kpis.availableSlots,
    occupancyPercent: kpis.occupancyPercent,
    revenueCents: kpis.actualRevenueCents,
    averageDurationMinutes,
    averageWaitingMinutes,
  };
}

export function bookingMatchesSlot(
  booking: OperationsBookingView,
  slotStartMinutes: number,
  slotEndMinutes: number,
  timezone: string,
): boolean {
  const bookingStart = TimezoneResolver.localTimeForInstant(
    TimezoneResolver.parseInstant(booking.startAt),
    timezone,
  );
  const bookingEnd = TimezoneResolver.localTimeForInstant(
    TimezoneResolver.parseInstant(booking.endAt),
    timezone,
  );

  const [bsH, bsM] = bookingStart.split(":").map(Number);
  const [beH, beM] = bookingEnd.split(":").map(Number);
  const bStart = bsH * 60 + bsM;
  const bEnd = beH * 60 + beM;

  return bStart < slotEndMinutes && bEnd > slotStartMinutes;
}

export function findBookingForSlot(
  bookings: OperationsBookingView[],
  slotStartMinutes: number,
  slotEndMinutes: number,
  timezone: string,
  resourceId?: string | null,
): OperationsBookingView | null {
  for (const booking of bookings) {
    if (resourceId && booking.resourceId !== resourceId) continue;
    if (bookingMatchesSlot(booking, slotStartMinutes, slotEndMinutes, timezone)) {
      return booking;
    }
  }
  return null;
}

export function slotKindForBooking(
  booking: OperationsBookingView | null,
): OperationsTimelineSlot["kind"] {
  if (!booking) return "available";
  return statusToTimelineKind(booking.status);
}
