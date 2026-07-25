import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { CalendarRepository } from "@/lib/calendar/repository/calendar-repository";
import { CalendarService } from "@/lib/calendar/services/calendar-service";
import { CalendarNavigationService } from "@/lib/calendar/services/calendar-navigation-service";
import { CalendarColorService } from "@/lib/calendar/services/calendar-color-service";
import { CalendarQueryPlanner } from "@/lib/calendar/services/calendar-query-planner";
import { CalendarPresenter } from "@/lib/calendar/services/calendar-presenter";

export function createCalendarServices(client: SupabaseClient = supabase) {
  const repository = new CalendarRepository(client);
  return {
    repository,
    calendar: new CalendarService(repository),
    navigation: new CalendarNavigationService(),
    colors: new CalendarColorService(),
    queryPlanner: new CalendarQueryPlanner(),
    presenter: new CalendarPresenter(),
  };
}

export type CalendarServices = ReturnType<typeof createCalendarServices>;

let defaultCalendarServices: CalendarServices | null = null;

export function getCalendarServices(): CalendarServices {
  if (!defaultCalendarServices) {
    defaultCalendarServices = createCalendarServices();
  }
  return defaultCalendarServices;
}

export * from "@/lib/calendar/types/calendar-event";
export * from "@/lib/calendar/types/calendar-view-state";
export * from "@/lib/calendar/types/calendar-range";
export * from "@/lib/calendar/types/calendar-interaction";
export { CalendarRepository } from "@/lib/calendar/repository/calendar-repository";
export { CalendarService, hashCalendarFilters } from "@/lib/calendar/services/calendar-service";
export { CalendarNavigationService } from "@/lib/calendar/services/calendar-navigation-service";
export { CalendarColorService } from "@/lib/calendar/services/calendar-color-service";
export { CalendarPresenter } from "@/lib/calendar/services/calendar-presenter";
export { CalendarQueryPlanner } from "@/lib/calendar/services/calendar-query-planner";
export {
  calendarEventsKey,
  calendarMetaKey,
  CALENDAR_KEY,
  CALENDAR_EVENTS_KEY,
} from "@/lib/calendar/cache/calendar-query-keys";
export { invalidateCalendarQueries } from "@/lib/calendar/cache/invalidate-calendar-queries";
export { TimelineLayoutService } from "@/lib/calendar/services/timeline-layout-service";
export * from "@/lib/calendar/types/timeline-layout";
export * from "@/lib/calendar/constants/calendar-time-grid-config";
export { layoutEventInDayGrid } from "@/lib/calendar/layout/day-grid-layout";
export { calendarEventToAppBooking } from "@/lib/calendar/adapters/legacy-booking-adapter";
export { CalendarInteractionController } from "@/lib/calendar/interaction/calendar-interaction-controller";
export { CalendarZoomService } from "@/lib/calendar/interaction/calendar-zoom-service";
export { CalendarSelectionService } from "@/lib/calendar/interaction/calendar-selection-service";
export { NowIndicatorService } from "@/lib/calendar/interaction/now-indicator-service";
export {
  NoOpCalendarRealtimePort,
  type CalendarRealtimePort,
} from "@/lib/calendar/interaction/calendar-realtime-port";
