import type { BranchComparisonRow } from "@/lib/organization/types";
import { percentRate, rankBy } from "@/lib/organization/utils/analytics-math";

export function buildBranchComparison(
  branches: Array<{
    branchId: string;
    branchName: string;
    regionName: string | null;
    healthScore: number;
    bookings: Array<{ status: string; priceCents: number }>;
    revenueCents?: number;
  }>,
): BranchComparisonRow[] {
  const rows = branches.map((b) => {
    const total = b.bookings.length;
    const noShow = b.bookings.filter((x) => x.status === "no_show").length;
    const cancelled = b.bookings.filter((x) => x.status === "cancelled").length;
    const revenue = b.revenueCents ?? b.bookings.reduce((s, x) => s + x.priceCents, 0);

    return {
      branchId: b.branchId,
      branchName: b.branchName,
      regionName: b.regionName,
      revenueCents: revenue,
      bookings: total,
      occupancy: percentRate(total, Math.max(total, 1)),
      noShowRate: percentRate(noShow, total),
      cancellationRate: percentRate(cancelled, total),
      avgWaitMinutes: 0,
      customerGrowth: 0,
      healthScore: b.healthScore,
      ranking: 0,
    };
  });

  return rankBy(rows, (r) => r.revenueCents);
}

export function buildHeatmap(rows: BranchComparisonRow[]): Array<{ branchId: string; metric: string; value: number }> {
  const heatmap: Array<{ branchId: string; metric: string; value: number }> = [];
  for (const row of rows) {
    heatmap.push({ branchId: row.branchId, metric: "revenue", value: row.revenueCents });
    heatmap.push({ branchId: row.branchId, metric: "occupancy", value: row.occupancy });
    heatmap.push({ branchId: row.branchId, metric: "health", value: row.healthScore });
  }
  return heatmap;
}
