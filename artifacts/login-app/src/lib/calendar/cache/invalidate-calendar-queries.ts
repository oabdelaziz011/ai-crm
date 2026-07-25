import type { QueryClient } from "@tanstack/react-query";
import { CALENDAR_EVENTS_KEY, CALENDAR_KEY } from "@/lib/calendar/cache/calendar-query-keys";

export function invalidateCalendarQueries(
  queryClient: QueryClient,
  companyId?: string | null,
): void {
  if (companyId) {
    void queryClient.invalidateQueries({
      queryKey: [...CALENDAR_EVENTS_KEY, companyId],
    });
    return;
  }
  void queryClient.invalidateQueries({ queryKey: CALENDAR_KEY });
}
