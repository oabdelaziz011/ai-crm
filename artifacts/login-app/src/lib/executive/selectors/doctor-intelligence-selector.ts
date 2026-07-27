import type { DoctorIntelligenceRow, RawExecutiveData } from "@/lib/executive/types";
import { percentRate, rankBy } from "@/lib/executive/selectors/executive-math";

export function buildDoctorIntelligence(data: RawExecutiveData): DoctorIntelligenceRow[] {
  const byDoctor = new Map<string, DoctorIntelligenceRow>();

  for (const booking of data.bookingsToday) {
    const existing = byDoctor.get(booking.resourceId) ?? {
      resourceId: booking.resourceId,
      resourceName: booking.resourceName,
      revenueCents: 0,
      appointments: 0,
      completionRate: 0,
      cancellationRate: 0,
      noShowRate: 0,
      averageDelayMinutes: 0,
      patientLoad: 0,
      utilization: 0,
      ranking: 0,
    };
    existing.appointments += 1;
    existing.revenueCents += booking.priceCents;
    existing.patientLoad = existing.appointments;
    byDoctor.set(booking.resourceId, existing);
  }

  const rows = [...byDoctor.values()].map((row) => {
    const doctorBookings = data.bookingsToday.filter((b) => b.resourceId === row.resourceId);
    const completed = doctorBookings.filter((b) => b.status === "completed").length;
    const cancelled = doctorBookings.filter((b) => b.status === "cancelled").length;
    const noShow = doctorBookings.filter((b) => b.status === "no_show").length;
    const total = row.appointments;
    return {
      ...row,
      completionRate: percentRate(completed, total),
      cancellationRate: percentRate(cancelled, total),
      noShowRate: percentRate(noShow, total),
      utilization: percentRate(total, Math.max(data.bookingsToday.length, 1)),
    };
  });

  return rankBy(rows, (r) => r.revenueCents);
}
