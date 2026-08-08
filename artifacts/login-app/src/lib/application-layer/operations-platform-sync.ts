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
  void qc.invalidateQueries({ queryKey: ["dashboard"] });
  void qc.invalidateQueries({ queryKey: ["calendar-events", companyId] });
  void qc.invalidateQueries({ queryKey: ["customer-timeline"] });
  // Entity Workspace Engine — shared CRM + Ops surface
  void qc.invalidateQueries({ queryKey: ["entity-workspace"] });

  // Existing financial/report keys — shape unchanged, refresh after payment.
  void qc.invalidateQueries({ queryKey: ["financial", "invoices", companyId] });
  void qc.invalidateQueries({ queryKey: ["financial", "payments", companyId] });
  void qc.invalidateQueries({ queryKey: ["financial", "metrics", companyId] });
  void qc.invalidateQueries({ queryKey: ["financial", "breakdown", companyId] });
  void qc.invalidateQueries({ queryKey: ["billing", "platform", "revenue"] });
  void qc.invalidateQueries({ queryKey: ["executive", "report"] });

  if (customerId) {
    void qc.invalidateQueries({ queryKey: ["customer360-workspace", bookingId, undefined, companyId] });
    void qc.invalidateQueries({ queryKey: ["customer-timeline", companyId, customerId] });
    void qc.invalidateQueries({ queryKey: ["entity-workspace", "notes", "customer", customerId] });
    void qc.invalidateQueries({ queryKey: ["entity-workspace", "timeline", "customer", customerId] });
    void qc.invalidateQueries({ queryKey: ["entity-workspace", "bundle"] });
  }

  invalidateOperationsQueries(qc, { companyId, customerId });
}
