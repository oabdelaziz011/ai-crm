import type { SchedulingBookingStatus } from "@/lib/scheduling/booking-domain";

export type OperationsDatePreset = "today" | "tomorrow" | "this_week" | "custom";

export type OperationsFilters = {
  datePreset: OperationsDatePreset;
  date: string;
  branchId: string | null;
  resourceIds: string[];
  serviceIds: string[];
  statuses: SchedulingBookingStatus[];
  search: string;
};

export const DEFAULT_OPERATIONS_FILTERS: OperationsFilters = {
  datePreset: "today",
  date: new Date().toISOString().slice(0, 10),
  branchId: null,
  resourceIds: [],
  serviceIds: [],
  statuses: [],
  search: "",
};
