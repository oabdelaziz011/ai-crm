import type { OperationalKpis, RawExecutiveData } from "@/lib/executive/types";
import { averageMinutes, percentRate } from "@/lib/executive/selectors/executive-math";

export function buildOperationalKpis(
  data: RawExecutiveData,
  advanced?: {
    peakHour: string | null;
    averageWaitMinutes: number;
    capacityUtilization: number;
    resourceUtilizationPercent: number;
  },
): OperationalKpis {
  const bookings = data.bookingsToday;
  const total = bookings.length;
  const completed = bookings.filter((b) => b.status === "completed").length;
  const cancelled = bookings.filter((b) => b.status === "cancelled").length;
  const noShow = bookings.filter((b) => b.status === "no_show").length;

  const durations = bookings
    .filter((b) => b.status === "completed")
    .map((b) => {
      const start = new Date(b.startAt).getTime();
      const end = new Date(b.endAt).getTime();
      return Math.max(1, Math.round((end - start) / 60_000));
    });

  const doctors = bookings.filter((b) => b.resourceName).length;
  const rooms = bookings.filter((b) => b.branchId).length;

  return {
    appointments: total,
    completionRate: percentRate(completed, total),
    cancellationRate: percentRate(cancelled, total),
    noShowRate: percentRate(noShow, total),
    averageWaitingMinutes: advanced?.averageWaitMinutes ?? 0,
    averageVisitDurationMinutes: averageMinutes(durations),
    peakHour: advanced?.peakHour ?? null,
    capacityUtilization: advanced?.capacityUtilization ?? 0,
    doctorOccupancy: percentRate(doctors, Math.max(total, 1)),
    roomOccupancy: percentRate(rooms, Math.max(total, 1)),
    equipmentUtilization: advanced?.resourceUtilizationPercent ?? 0,
  };
}
