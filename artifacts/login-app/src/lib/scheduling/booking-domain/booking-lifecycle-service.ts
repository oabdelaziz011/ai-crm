import { WORKFLOW_PACK_CLINIC, EnterpriseWorkflowEngine } from "@workspace/universal-operations-engine";
import type { SchedulingBookingStatus } from "@/lib/scheduling/booking-domain/types";

/**
 * Transition policy is owned by the Clinic pack on the Enterprise Workflow Engine.
 * Domain `isActive` (slot occupancy) stays scheduling-specific and is not KPI "in progress".
 */
const clinicEngine = new EnterpriseWorkflowEngine(WORKFLOW_PACK_CLINIC);
const WORKFLOW_ALLOWED = clinicEngine.buildAllowedTransitionMap();

export class BookingLifecycleService {
  static canTransition(from: SchedulingBookingStatus, to: SchedulingBookingStatus): boolean {
    return WORKFLOW_ALLOWED[from]?.includes(to) ?? false;
  }

  static assertTransition(from: SchedulingBookingStatus, to: SchedulingBookingStatus): void {
    if (!BookingLifecycleService.canTransition(from, to)) {
      throw new Error(`INVALID_STATUS_TRANSITION:${from}->${to}`);
    }
  }

  static isTerminal(status: SchedulingBookingStatus): boolean {
    return (WORKFLOW_ALLOWED[status] ?? []).length === 0;
  }

  /** Occupies a scheduling slot — broader than workflow KPI "in progress". */
  static isActive(status: SchedulingBookingStatus): boolean {
    return (
      status === "pending" ||
      status === "confirmed" ||
      status === "checked_in" ||
      status === "with_nurse" ||
      status === "in_progress"
    );
  }
}
