import type { ResourceOccupancySlice } from "@/lib/billing/company-resource-limits";
import { occupancyDisplayUsed } from "@/lib/billing/company-resource-limits";

export type OccupancyDisplayRow = {
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
  overLimit: boolean;
};

export function occupancyDisplayRow(slice: ResourceOccupancySlice | null | undefined): OccupancyDisplayRow {
  if (!slice) {
    return { used: 0, limit: null, remaining: null, unlimited: true, overLimit: false };
  }
  const used = occupancyDisplayUsed(slice);
  const unlimited = Boolean(slice.is_unlimited || slice.max_allowed == null);
  const limit = unlimited ? null : slice.max_allowed;
  const remaining = unlimited ? null : Math.max(0, (limit ?? 0) - used);
  return {
    used,
    limit,
    remaining,
    unlimited,
    overLimit: Boolean(slice.is_over_limit) || (!unlimited && used > (limit ?? 0)),
  };
}

export function occupancyRatioLabel(row: OccupancyDisplayRow, unlimitedLabel: string): string {
  if (row.unlimited) return `${row.used} / ${unlimitedLabel}`;
  return `${row.used} / ${row.limit ?? 0}`;
}
