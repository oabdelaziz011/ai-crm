import { useQuery } from "@tanstack/react-query";
import { getBusinessCalendarService } from "@/lib/scheduling/business-calendar";
import type { DatePickerConstraintOptions, DatePickerConstraintsSnapshot } from "@/lib/scheduling/business-calendar";

export function businessCalendarConstraintsQueryKey(
  companyId: string | null,
  options: DatePickerConstraintOptions | null,
) {
  return [
    "business-calendar-constraints",
    companyId,
    options?.disablePastDates ?? null,
    options?.disableCompanyHolidays ?? null,
    options?.holidayBehavior ?? null,
    options?.disableClosedWeekdays ?? null,
    options?.branchId ?? null,
  ] as const;
}

export function useBusinessCalendarConstraints(
  companyId: string | null | undefined,
  options: DatePickerConstraintOptions | null,
) {
  return useQuery<DatePickerConstraintsSnapshot>({
    queryKey: businessCalendarConstraintsQueryKey(companyId ?? null, options),
    enabled: Boolean(companyId && options),
    queryFn: async () => {
      if (!companyId || !options) {
        throw new Error("Company id and options are required.");
      }
      return getBusinessCalendarService().getDatePickerConstraints({
        companyId,
        ...options,
      });
    },
    staleTime: 60_000,
  });
}
