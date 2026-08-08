import type { SchedulingBookingStatus } from "./types.js";

/**
 * Keep in sync with WORKFLOW_PACK_CLINIC transitions in
 * `@workspace/universal-operations-engine` (Enterprise Workflow Engine).
 * scheduling-engine intentionally does not depend on that package.
 */
const ALLOWED_TRANSITIONS: Record<SchedulingBookingStatus, SchedulingBookingStatus[]> = {
  pending: ["confirmed", "checked_in", "cancelled", "rescheduled"],
  confirmed: ["checked_in", "cancelled", "no_show", "rescheduled"],
  checked_in: ["with_nurse", "cancelled", "no_show"],
  with_nurse: ["in_progress", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled"],
  completed: ["archived"],
  archived: [],
  cancelled: [],
  no_show: [],
  rescheduled: [],
};

export class BookingLifecycleService {
  static canTransition(from: SchedulingBookingStatus, to: SchedulingBookingStatus): boolean {
    return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
  }

  static assertTransition(from: SchedulingBookingStatus, to: SchedulingBookingStatus): void {
    if (!BookingLifecycleService.canTransition(from, to)) {
      throw new Error(`INVALID_STATUS_TRANSITION:${from}->${to}`);
    }
  }

  static isTerminal(status: SchedulingBookingStatus): boolean {
    return (ALLOWED_TRANSITIONS[status] ?? []).length === 0;
  }

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
