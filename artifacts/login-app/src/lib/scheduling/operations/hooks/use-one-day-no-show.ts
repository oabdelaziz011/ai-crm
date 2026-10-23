import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { invalidateBookingQueries } from "@/lib/booking/invalidate-booking-queries";
import { getBookingDomainServices } from "@/lib/scheduling/booking-domain";
import { invalidateOperationsQueries } from "@/lib/scheduling/operations/cache";
import {
  ONE_DAY_NO_SHOW_GRACE_MINUTES,
  selectOneDayNoShowCandidates,
} from "@/lib/scheduling/operations/automation/one-day-no-show";

const bookingDomain = getBookingDomainServices();
const inFlightCompanies = new Set<string>();

type ConfirmedBookingRow = {
  id: string;
  customer_id: string | null;
  start_at: string;
  timezone: string | null;
  status: string;
};

async function recordOneDayNoShows(companyId: string): Promise<number> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data, error } = await supabase
    .from("scheduling_bookings")
    .select("id, customer_id, start_at, timezone, status")
    .eq("company_id", companyId)
    .eq("status", "confirmed")
    .is("deleted_at", null)
    .lt("start_at", new Date().toISOString())
    .limit(500);

  if (error || !data) return 0;

  const due = selectOneDayNoShowCandidates(
    (data as ConfirmedBookingRow[]).map((row) => ({
      id: row.id,
      status: row.status,
      startAt: row.start_at,
      timezone: row.timezone,
      customerId: row.customer_id,
    })),
  );

  let recorded = 0;
  for (const row of due) {
    try {
      await bookingDomain.bookingDomain.markNoShowBooking({
        companyId,
        bookingId: row.id,
        updatedBy: user.id,
        gracePeriodMinutes: ONE_DAY_NO_SHOW_GRACE_MINUTES,
      });
      recorded += 1;
    } catch {
      // A concurrent status change can reject the transition.
    }
  }
  return recorded;
}

/** Persists confirmed visits as no-show once their appointment date is a previous day. */
export function useRecordOneDayNoShows(companyId: string | null, enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !companyId || inFlightCompanies.has(companyId)) return;
    inFlightCompanies.add(companyId);

    void recordOneDayNoShows(companyId)
      .then((recorded) => {
        if (recorded === 0) return;
        invalidateOperationsQueries(queryClient, { companyId });
        void queryClient.invalidateQueries({ queryKey: ["universal-operations"] });
        invalidateBookingQueries(queryClient, { companyId });
      })
      .finally(() => {
        inFlightCompanies.delete(companyId);
      });
  }, [companyId, enabled, queryClient]);
}
