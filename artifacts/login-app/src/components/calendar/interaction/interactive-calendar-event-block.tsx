import type { CSSProperties } from "react";
import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";
import { CalendarEventBlock } from "@/components/calendar/events/calendar-event-block";
import { CalendarEventContextMenu } from "@/components/calendar/interaction/calendar-event-context-menu";
import { CalendarResizeHandles } from "@/components/calendar/interaction/calendar-resize-handles";
import { displayTimeToMinutes } from "@/lib/calendar/constants/calendar-time-grid-config";

export type InteractiveCalendarEventHandlers = {
  onOpenBooking?: (event: CalendarEvent) => void;
  onOpenCustomer?: (event: CalendarEvent) => void;
  onReschedule?: (event: CalendarEvent) => void;
  onComplete?: (event: CalendarEvent) => void;
  onCancel?: (event: CalendarEvent) => void;
  onSelect?: (
    event: CalendarEvent,
    modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => void;
  onStartDrag?: (
    event: CalendarEvent,
    date: string,
    axis: "vertical" | "horizontal",
    pointerMinutes: number,
    gridSizePx: number,
    clientX: number,
    clientY: number,
  ) => void;
  onStartResize?: (
    event: CalendarEvent,
    date: string,
    axis: "vertical" | "horizontal",
    edge: "top" | "bottom",
    gridSizePx: number,
    clientX: number,
    clientY: number,
  ) => void;
};

type InteractiveCalendarEventBlockProps = {
  event: CalendarEvent;
  date: string;
  style?: CSSProperties;
  selected?: boolean;
  axis?: "vertical" | "horizontal";
  gridSizePx: number;
  handlers?: InteractiveCalendarEventHandlers;
};

export function InteractiveCalendarEventBlock({
  event,
  date,
  style,
  selected,
  axis = "vertical",
  gridSizePx,
  handlers,
}: InteractiveCalendarEventBlockProps) {
  const pointerMinutes = displayTimeToMinutes(event.displayStart);

  return (
    <CalendarEventContextMenu
      event={event}
      onOpenBooking={handlers?.onOpenBooking}
      onOpenCustomer={handlers?.onOpenCustomer}
      onReschedule={handlers?.onReschedule}
      onComplete={handlers?.onComplete}
      onCancel={handlers?.onCancel}
    >
      <div
        className="absolute"
        style={style}
        onPointerDown={(pointerEvent) => {
          if (!event.isDraggable || pointerEvent.button !== 0) return;
          if ((pointerEvent.target as HTMLElement).closest('[role="separator"]')) return;
          handlers?.onStartDrag?.(
            event,
            date,
            axis,
            pointerMinutes,
            gridSizePx,
            pointerEvent.clientX,
            pointerEvent.clientY,
          );
        }}
      >
        <CalendarEventBlock
          event={event}
          selected={selected}
          style={{ position: "relative", inset: 0, width: "100%", height: "100%" }}
          onClick={(clicked, nativeEvent) =>
            handlers?.onSelect?.(clicked, {
              shiftKey: nativeEvent?.shiftKey ?? false,
              ctrlKey: nativeEvent?.ctrlKey ?? false,
              metaKey: nativeEvent?.metaKey ?? false,
            })
          }
        />
        <CalendarResizeHandles
          enabled={event.isResizable}
          onResizeTop={(pointerEvent) => {
            pointerEvent.stopPropagation();
            handlers?.onStartResize?.(
              event,
              date,
              axis,
              "top",
              gridSizePx,
              pointerEvent.clientX,
              pointerEvent.clientY,
            );
          }}
          onResizeBottom={(pointerEvent) => {
            pointerEvent.stopPropagation();
            handlers?.onStartResize?.(
              event,
              date,
              axis,
              "bottom",
              gridSizePx,
              pointerEvent.clientX,
              pointerEvent.clientY,
            );
          }}
        />
      </div>
    </CalendarEventContextMenu>
  );
}
