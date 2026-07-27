import type { QueryClient } from "@tanstack/react-query";
import { invalidateBookingQueries } from "@/lib/booking/invalidate-booking-queries";
import { OPERATIONS_KEY } from "@/lib/scheduling/operations/cache/query-keys";

export function invalidateOperationsQueries(
  qc: QueryClient,
  options?: { companyId?: string | null; customerId?: string | null },
): void {
  void qc.invalidateQueries({ queryKey: OPERATIONS_KEY });
  invalidateBookingQueries(qc, {
    companyId: options?.companyId ?? null,
    customerId: options?.customerId,
  });
}
