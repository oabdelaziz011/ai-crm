import type { OperationsTimelineSlotKind } from "@/lib/scheduling/operations/types";
import type { SchedulingBookingStatus } from "@/lib/scheduling/booking-domain";

export const OPERATIONS_SLOT_COLORS: Record<
  OperationsTimelineSlotKind,
  { bg: string; border: string; text: string }
> = {
  booked: {
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/40",
    text: "text-emerald-300",
  },
  available: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-300",
  },
  checked_in: {
    bg: "bg-amber-500/15",
    border: "border-amber-500/40",
    text: "text-amber-300",
  },
  completed: {
    bg: "bg-blue-500/15",
    border: "border-blue-500/40",
    text: "text-blue-300",
  },
  cancelled: {
    bg: "bg-zinc-500/10",
    border: "border-zinc-500/30",
    text: "text-zinc-400",
  },
};

export function statusToTimelineKind(status: SchedulingBookingStatus): OperationsTimelineSlotKind {
  switch (status) {
    case "confirmed":
    case "pending":
      return "booked";
    case "checked_in":
      return "checked_in";
    case "completed":
      return "completed";
    case "cancelled":
    case "no_show":
    case "rescheduled":
      return "cancelled";
    default:
      return "booked";
  }
}

export function statusBadgeClasses(status: SchedulingBookingStatus): string {
  const kind = statusToTimelineKind(status);
  const colors = OPERATIONS_SLOT_COLORS[kind];
  return `${colors.bg} ${colors.border} ${colors.text} border`;
}
