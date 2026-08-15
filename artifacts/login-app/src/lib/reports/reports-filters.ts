/** Shared filter state for the Reports workspace. */
export type ReportsDateRange = {
  from: string | null; // yyyy-mm-dd
  to: string | null;
};

export type ReportsWorkspaceFilters = {
  reportId: string;
  branchId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
};

export function defaultDateRange(daysBack = 30): ReportsDateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - daysBack);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function isDateInRange(
  iso: string | null | undefined,
  range: ReportsDateRange,
): boolean {
  if (!iso) return !range.from && !range.to;
  const day = iso.slice(0, 10);
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}
