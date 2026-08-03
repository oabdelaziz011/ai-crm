import type { QueryClient } from "@tanstack/react-query";
import { invalidateOperationsQueries } from "@/lib/scheduling/operations/cache";

/** Invalidate platform queries after booking/payment/customer changes. */
export function invalidateOperationsPlatformQueries(
  qc: QueryClient,
  options: {
    companyId: string;
    customerId?: string | null;
    bookingId?: string | null;
  },
): void {
  const { companyId, customerId, bookingId } = options;

  void qc.invalidateQueries({ queryKey: ["universal-operations", "queue"] });
  void qc.invalidateQueries({ queryKey: ["universal-operations", "config"] });
  void qc.invalidateQueries({ queryKey: ["configuration"] });
  void qc.invalidateQueries({ queryKey: ["customer360-workspace"] });
  void qc.invalidateQueries({ queryKey: ["dashboard-snapshot", companyId] });
  void qc.invalidateQueries({ queryKey: ["calendar-events", companyId] });
  void qc.invalidateQueries({ queryKey: ["customer-timeline"] });

  if (customerId) {
    void qc.invalidateQueries({ queryKey: ["customer360-workspace", bookingId, undefined, companyId] });
    void qc.invalidateQueries({ queryKey: ["customer-timeline", companyId, customerId] });
  }

  invalidateOperationsQueries(qc, { companyId, customerId });
}
