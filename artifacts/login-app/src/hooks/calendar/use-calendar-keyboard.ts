import { useEffect } from "react";
import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";

type UseCalendarKeyboardOptions = {
  enabled?: boolean;
  selectedEventId?: string | null;
  events: CalendarEvent[];
  onOpenEvent?: (event: CalendarEvent) => void;
  onCancelEvent?: (event: CalendarEvent) => void;
  onClearSelection?: () => void;
  onNavigateDay?: (direction: "previous" | "next") => void;
};

export function useCalendarKeyboard({
  enabled = true,
  selectedEventId,
  events,
  onOpenEvent,
  onCancelEvent,
  onClearSelection,
  onNavigateDay,
}: UseCalendarKeyboardOptions) {
  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;

      const selected = events.find((item) => item.id === selectedEventId) ?? null;

      if (event.key === "Escape") {
        onClearSelection?.();
        return;
      }

      if ((event.key === "Enter" || event.key === " ") && selected) {
        event.preventDefault();
        onOpenEvent?.(selected);
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selected) {
        event.preventDefault();
        onCancelEvent?.(selected);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onNavigateDay?.("previous");
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onNavigateDay?.("next");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    enabled,
    events,
    onCancelEvent,
    onClearSelection,
    onNavigateDay,
    onOpenEvent,
    selectedEventId,
  ]);
}
