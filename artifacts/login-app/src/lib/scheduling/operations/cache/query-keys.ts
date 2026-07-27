export const OPERATIONS_KEY = ["scheduling-operations"] as const;

export function operationsDayKey(
  companyId: string | null,
  date: string,
  filterSignature: string,
) {
  return [...OPERATIONS_KEY, companyId, date, filterSignature] as const;
}

export function operationsFilterSignature(filters: {
  branchId: string | null;
  resourceIds: string[];
  serviceIds: string[];
  statuses: string[];
  search: string;
}): string {
  return JSON.stringify(filters);
}
