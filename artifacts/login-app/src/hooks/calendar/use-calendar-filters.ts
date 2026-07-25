import { useCallback } from "react";
import type { SchedulingBookingStatus } from "@/lib/scheduling/booking-domain";
import type { CalendarFilters } from "@/lib/calendar/types/calendar-view-state";

type UseCalendarFiltersOptions = {
  filters: CalendarFilters;
  setFilters: (filters: Partial<CalendarFilters>) => void;
};

export function useCalendarFilters({ filters, setFilters }: UseCalendarFiltersOptions) {
  const setBranchFilter = useCallback(
    (branchId: string | null) => setFilters({ branchId }),
    [setFilters],
  );

  const setResourceFilter = useCallback(
    (resourceIds: string[] | "all") => setFilters({ resourceIds }),
    [setFilters],
  );

  const toggleResource = useCallback(
    (resourceId: string) => {
      if (filters.resourceIds === "all") {
        setFilters({ resourceIds: [resourceId] });
        return;
      }
      const next = filters.resourceIds.includes(resourceId)
        ? filters.resourceIds.filter((id) => id !== resourceId)
        : [...filters.resourceIds, resourceId];
      setFilters({ resourceIds: next.length ? next : "all" });
    },
    [filters.resourceIds, setFilters],
  );

  const setServiceFilter = useCallback(
    (serviceIds: string[]) => setFilters({ serviceIds }),
    [setFilters],
  );

  const toggleStatus = useCallback(
    (status: SchedulingBookingStatus) => {
      const next = filters.statuses.includes(status)
        ? filters.statuses.filter((item) => item !== status)
        : [...filters.statuses, status];
      setFilters({ statuses: next });
    },
    [filters.statuses, setFilters],
  );

  const clearFilters = useCallback(() => {
    setFilters({
      branchId: null,
      resourceIds: "all",
      serviceIds: [],
    });
  }, [setFilters]);

  return {
    filters,
    setBranchFilter,
    setResourceFilter,
    toggleResource,
    setServiceFilter,
    toggleStatus,
    clearFilters,
  };
}
