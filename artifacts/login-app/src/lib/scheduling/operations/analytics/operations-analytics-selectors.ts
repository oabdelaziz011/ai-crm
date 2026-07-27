import type {
  OperationsBookingView,
  OperationsKpiSnapshot,
  OperationsTimelineSlot,
} from "@/lib/scheduling/operations/types";

export type OperationsCapacityMetrics = {
  occupancyPercent: number;
  availabilityPercent: number;
  utilizationPercent: number;
  bookedSlots: number;
  availableSlots: number;
  totalSlots: number;
};

export type ResourceUtilizationRow = {
  resourceId: string;
  resourceName: string;
  resourceType: string;
  bookingsCount: number;
  busyPercent: number;
  completedPercent: number;
  averageDelayMinutes: number;
};

export type OperationsAdvancedKpis = {
  peakHour: string | null;
  peakHourBookings: number;
  averageDelayMinutes: number;
  averageWaitMinutes: number;
  cancellationRate: number;
  noShowRate: number;
  resourceUtilizationPercent: number;
  todaysLoad: number;
  hourlyDistribution: Array<{ hour: string; count: number }>;
};

export function computeCapacityMetrics(
  kpis: OperationsKpiSnapshot,
  timelineSlots: OperationsTimelineSlot[],
): OperationsCapacityMetrics {
  const totalSlots = timelineSlots.length;
  const bookedSlots = timelineSlots.filter((s) => s.kind !== "available").length;
  const availableSlots = kpis.availableSlots;
  const occupancyPercent = kpis.occupancyPercent;
  const availabilityPercent =
    totalSlots > 0 ? Math.round((availableSlots / totalSlots) * 100) : 100;
  const utilizationPercent = occupancyPercent;

  return {
    occupancyPercent,
    availabilityPercent,
    utilizationPercent,
    bookedSlots,
    availableSlots,
    totalSlots,
  };
}

export function computeResourceUtilization(
  bookings: OperationsBookingView[],
  referenceNow: Date = new Date(),
): ResourceUtilizationRow[] {
  const byResource = new Map<string, OperationsBookingView[]>();

  for (const booking of bookings) {
    if (["cancelled", "rescheduled"].includes(booking.status)) continue;
    const list = byResource.get(booking.resourceId) ?? [];
    list.push(booking);
    byResource.set(booking.resourceId, list);
  }

  const nowMs = referenceNow.getTime();
  const rows: ResourceUtilizationRow[] = [];

  for (const [resourceId, resourceBookings] of byResource) {
    const sample = resourceBookings[0];
    const total = resourceBookings.length;
    const active = resourceBookings.filter((b) =>
      ["pending", "confirmed", "checked_in"].includes(b.status),
    ).length;
    const completed = resourceBookings.filter((b) => b.status === "completed").length;

    const delays = resourceBookings
      .filter((b) => ["checked_in", "completed"].includes(b.status))
      .map((b) => {
        const startMs = new Date(b.startAt).getTime();
        const eventMs = new Date(b.updatedAt).getTime();
        return Math.max(0, Math.floor((eventMs - startMs) / 60_000));
      });

    rows.push({
      resourceId,
      resourceName: sample.resource?.name ?? "—",
      resourceType: sample.resource?.type ?? "other",
      bookingsCount: total,
      busyPercent: total > 0 ? Math.round((active / total) * 100) : 0,
      completedPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
      averageDelayMinutes:
        delays.length > 0
          ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length)
          : 0,
    });
  }

  return rows.sort((a, b) => b.busyPercent - a.busyPercent || b.bookingsCount - a.bookingsCount);
}

export function computeAdvancedKpis(
  bookings: OperationsBookingView[],
  timelineSlots: OperationsTimelineSlot[],
  resourceUtilization: ResourceUtilizationRow[],
  referenceNow: Date = new Date(),
): OperationsAdvancedKpis {
  const actionable = bookings.filter((b) => !["rescheduled"].includes(b.status));
  const total = actionable.length;
  const cancelled = actionable.filter((b) => b.status === "cancelled").length;
  const noShow = actionable.filter((b) => b.status === "no_show").length;

  const hourCounts = new Map<string, number>();
  for (const booking of actionable) {
    const hour = booking.displayStart.slice(0, 2);
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }

  let peakHour: string | null = null;
  let peakHourBookings = 0;
  for (const [hour, count] of hourCounts) {
    if (count > peakHourBookings) {
      peakHour = hour;
      peakHourBookings = count;
    }
  }

  const checkedIn = actionable.filter((b) => b.status === "checked_in");
  const nowMs = referenceNow.getTime();
  const waitMinutes = checkedIn.map((b) =>
    Math.max(0, Math.floor((nowMs - new Date(b.updatedAt).getTime()) / 60_000)),
  );
  const delayMinutes = actionable
    .filter((b) => ["checked_in", "completed"].includes(b.status))
    .map((b) =>
      Math.max(0, Math.floor((new Date(b.updatedAt).getTime() - new Date(b.startAt).getTime()) / 60_000)),
    );

  const hourlyDistribution = Array.from(hourCounts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, count]) => ({ hour: `${hour}:00`, count }));

  const avgUtil =
    resourceUtilization.length > 0
      ? Math.round(
          resourceUtilization.reduce((sum, r) => sum + r.busyPercent, 0) /
            resourceUtilization.length,
        )
      : 0;

  return {
    peakHour: peakHour ? `${peakHour}:00` : null,
    peakHourBookings,
    averageDelayMinutes:
      delayMinutes.length > 0
        ? Math.round(delayMinutes.reduce((a, b) => a + b, 0) / delayMinutes.length)
        : 0,
    averageWaitMinutes:
      waitMinutes.length > 0
        ? Math.round(waitMinutes.reduce((a, b) => a + b, 0) / waitMinutes.length)
        : 0,
    cancellationRate: total > 0 ? Math.round((cancelled / total) * 100) : 0,
    noShowRate: total > 0 ? Math.round((noShow / total) * 100) : 0,
    resourceUtilizationPercent: avgUtil,
    todaysLoad: timelineSlots.filter((s) => s.kind !== "available").length,
    hourlyDistribution,
  };
}
