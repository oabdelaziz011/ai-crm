import type { BranchIntelligenceRow, RawExecutiveData } from "@/lib/executive/types";
import { healthScore, percentRate, rankBy } from "@/lib/executive/selectors/executive-math";

export function buildBranchIntelligence(data: RawExecutiveData): BranchIntelligenceRow[] {
  const byBranch = new Map<string, BranchIntelligenceRow>();

  for (const branch of data.branches) {
    byBranch.set(branch.id, {
      branchId: branch.id,
      branchName: branch.name,
      revenueCents: 0,
      bookings: 0,
      occupancy: 0,
      averageWaitMinutes: 0,
      averageRating: null,
      staffUtilization: 0,
      ranking: 0,
      healthScore: 0,
    });
  }

  for (const booking of data.bookingsToday) {
    const branchId = booking.branchId ?? "unassigned";
    const row = byBranch.get(branchId) ?? {
      branchId,
      branchName: booking.branchName ?? "Unassigned",
      revenueCents: 0,
      bookings: 0,
      occupancy: 0,
      averageWaitMinutes: 0,
      averageRating: null,
      staffUtilization: 0,
      ranking: 0,
      healthScore: 0,
    };
    row.bookings += 1;
    row.revenueCents += booking.priceCents;
    byBranch.set(branchId, row);
  }

  const totalBookings = data.bookingsToday.length || 1;
  const rows = [...byBranch.values()].map((row) => {
    const branchBookings = data.bookingsToday.filter((b) => (b.branchId ?? "unassigned") === row.branchId);
    const cancelled = branchBookings.filter((b) => b.status === "cancelled").length;
    const noShow = branchBookings.filter((b) => b.status === "no_show").length;
    const occupancy = percentRate(row.bookings, totalBookings);
    return {
      ...row,
      occupancy,
      staffUtilization: occupancy,
      healthScore: healthScore({
        occupancy,
        cancellationRate: percentRate(cancelled, Math.max(row.bookings, 1)),
        noShowRate: percentRate(noShow, Math.max(row.bookings, 1)),
        waitMinutes: 0,
      }),
    };
  });

  return rankBy(rows, (r) => r.revenueCents);
}
