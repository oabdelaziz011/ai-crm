import type { QueryClient } from "@tanstack/react-query";
import { SIDEBAR_BADGES_KEY } from "@/hooks/use-sidebar-badge-counts";
import { refreshCustomerProfileCache } from "@/lib/customer-profile/refresh-customer-profile";
import { BOOKINGS_KEY, BOOKING_SLOTS_KEY, bookingSlotsKey } from "@/lib/booking/booking-query-keys";
import { invalidateCalendarQueries } from "@/lib/calendar/cache/invalidate-calendar-queries";

export type BookingCacheInvalidation = {
  companyId?: string | null;
  customerId?: string | null;
  resourceId?: string | null;
  serviceId?: string | null;
  date?: string | null;
};

export function invalidateBookingQueries(
  queryClient: QueryClient,
  scope: BookingCacheInvalidation = {},
): void {
  void queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
  void queryClient.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY });
  invalidateCalendarQueries(queryClient, scope.companyId);

  if (scope.customerId) {
    refreshCustomerProfileCache(queryClient, scope.customerId, scope.companyId ?? null);
  }

  if (scope.companyId && scope.resourceId && scope.serviceId && scope.date) {
    void queryClient.invalidateQueries({
      queryKey: bookingSlotsKey(
        scope.companyId,
        scope.resourceId,
        scope.serviceId,
        scope.date,
      ),
    });
  } else if (scope.companyId) {
    invalidateAllBookingSlotQueries(queryClient, scope.companyId);
  }
}

/** Invalidate cached slot queries after scheduling configuration changes. */
export function invalidateAllBookingSlotQueries(
  queryClient: QueryClient,
  companyId?: string | null,
): void {
  if (companyId) {
    void queryClient.invalidateQueries({
      queryKey: [...BOOKING_SLOTS_KEY, companyId],
    });
    return;
  }
  void queryClient.invalidateQueries({ queryKey: BOOKING_SLOTS_KEY });
}
