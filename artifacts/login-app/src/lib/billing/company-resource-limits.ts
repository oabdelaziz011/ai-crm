export type ResourceOccupancySlice = {
  current_count: number;
  max_allowed: number | null;
  remaining: number | null;
  is_over_limit: boolean;
  is_unlimited: boolean;
  pending_reservations?: number;
  effective_used?: number;
};

export type CompanyResourceOccupancy = {
  company_id: string;
  source: string;
  users: ResourceOccupancySlice;
  branches: ResourceOccupancySlice;
};

export type PackageResourceLimits = {
  maxUsers: number | null;
  maxBranches: number | null;
};

export function resourceLimitsForPackageCode(code: string | null | undefined): PackageResourceLimits {
  const normalized = (code ?? "").trim().toLowerCase();
  if (
    normalized === "basic" ||
    normalized === "starter" ||
    normalized.startsWith("basic") ||
    normalized.startsWith("starter")
  ) {
    return { maxUsers: 5, maxBranches: 1 };
  }
  if (
    normalized === "pro" ||
    normalized === "growth" ||
    normalized.startsWith("pro") ||
    normalized.startsWith("growth")
  ) {
    return { maxUsers: 25, maxBranches: 5 };
  }
  if (normalized === "enterprise" || normalized.startsWith("enterprise")) {
    return { maxUsers: null, maxBranches: 20 };
  }
  return { maxUsers: 5, maxBranches: 1 };
}

export function formatResourceOccupancy(
  current: number,
  max: number | null | undefined,
  unlimitedLabel: string,
): string {
  if (max == null) return `${current} / ${unlimitedLabel}`;
  return `${current} / ${max}`;
}

export function occupancyDisplayUsed(slice: ResourceOccupancySlice): number {
  if (typeof slice.effective_used === "number") return slice.effective_used;
  return slice.current_count + (slice.pending_reservations ?? 0);
}

export function occupancyAllowsCreate(slice: ResourceOccupancySlice | null | undefined): boolean {
  if (!slice) return true;
  if (slice.is_unlimited || slice.max_allowed == null) return true;
  if (slice.remaining != null) return slice.remaining > 0 && !slice.is_over_limit;
  return occupancyDisplayUsed(slice) < slice.max_allowed;
}

export function isUserSeatLimitError(message: string | null | undefined): boolean {
  return (message ?? "").toLowerCase().includes("user_seat_limit_reached");
}

export function isBranchLimitError(message: string | null | undefined): boolean {
  return (message ?? "").toLowerCase().includes("branch_limit_reached");
}
