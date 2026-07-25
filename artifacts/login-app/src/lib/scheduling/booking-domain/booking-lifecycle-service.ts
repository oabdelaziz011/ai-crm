import type { SchedulingBookingStatus } from "@/lib/scheduling/booking-domain/types";

const ALLOWED_TRANSITIONS: Record<SchedulingBookingStatus, SchedulingBookingStatus[]> = {
  pending: ["confirmed", "cancelled", "rescheduled"],
  confirmed: ["completed", "cancelled", "no_show", "rescheduled"],
  completed: [],
  cancelled: [],
  no_show: [],
  rescheduled: [],
};

export class BookingLifecycleService {
  static canTransition(
    from: SchedulingBookingStatus,
    to: SchedulingBookingStatus,
  ): boolean {
    return ALLOWED_TRANSITIONS[from].includes(to);
  }

  static assertTransition(
    from: SchedulingBookingStatus,
    to: SchedulingBookingStatus,
  ): void {
    if (!BookingLifecycleService.canTransition(from, to)) {
      throw new Error(`INVALID_STATUS_TRANSITION:${from}->${to}`);
    }
  }

  static isTerminal(status: SchedulingBookingStatus): boolean {
    return ALLOWED_TRANSITIONS[status].length === 0;
  }

  static isActive(status: SchedulingBookingStatus): boolean {
    return status === "pending" || status === "confirmed";
  }
}
