import type { CalendarInteractionState } from "@/lib/calendar/interaction/calendar-interaction-state";
import type { InteractiveCalendarEventHandlers } from "@/components/calendar/interaction/interactive-calendar-event-block";

export type CalendarGridInteractionProps = {
  interactionState: CalendarInteractionState;
  hiddenEventIds: Set<string>;
  hourRowHeight: number;
  handlers: InteractiveCalendarEventHandlers;
  onTargetDateChange?: (date: string) => void;
  onCancelInteraction?: () => void;
};
