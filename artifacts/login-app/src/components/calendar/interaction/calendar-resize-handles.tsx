import type { CalendarEvent } from "@/lib/calendar/types/calendar-event";
import { cn } from "@/lib/utils";

type CalendarResizeHandlesProps = {
  enabled?: boolean;
  onResizeTop?: (event: React.PointerEvent) => void;
  onResizeBottom?: (event: React.PointerEvent) => void;
};

export function CalendarResizeHandles({
  enabled,
  onResizeTop,
  onResizeBottom,
}: CalendarResizeHandlesProps) {
  if (!enabled) return null;

  return (
    <>
      <span
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize start"
        onPointerDown={onResizeTop}
        className={cn(
          "absolute left-0 right-0 top-0 h-2 cursor-ns-resize touch-none",
        )}
      />
      <span
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize end"
        onPointerDown={onResizeBottom}
        className={cn(
          "absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize touch-none",
        )}
      />
    </>
  );
}
