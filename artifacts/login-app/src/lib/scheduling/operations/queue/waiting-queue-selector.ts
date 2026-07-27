import type { OperationsBookingView } from "@/lib/scheduling/operations/types";

export type WaitingQueueEntry = {
  bookingId: string;
  customerName: string;
  serviceName: string;
  resourceName: string;
  resourceType: string;
  waitingMinutes: number;
  priority: number;
  checkedInAt: string;
  startAt: string;
};

/** Checked-in bookings not yet completed, longest wait first. */
export function buildWaitingQueue(
  bookings: OperationsBookingView[],
  referenceNow: Date = new Date(),
): WaitingQueueEntry[] {
  const nowMs = referenceNow.getTime();

  return bookings
    .filter((b) => b.status === "checked_in")
    .map((booking) => {
      const checkedInMs = new Date(booking.updatedAt).getTime();
      const waitingMinutes = Math.max(0, Math.floor((nowMs - checkedInMs) / 60_000));
      const startMs = new Date(booking.startAt).getTime();
      const delayMinutes = Math.max(0, Math.floor((nowMs - startMs) / 60_000));

      return {
        bookingId: booking.id,
        customerName: booking.customer?.name ?? "—",
        serviceName: booking.service?.name ?? "—",
        resourceName: booking.resource?.name ?? "—",
        resourceType: booking.resource?.type ?? "other",
        waitingMinutes,
        priority: waitingMinutes * 10 + delayMinutes,
        checkedInAt: booking.updatedAt,
        startAt: booking.startAt,
      };
    })
    .sort((a, b) => b.priority - a.priority || b.waitingMinutes - a.waitingMinutes);
}

export function formatWaitingDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
