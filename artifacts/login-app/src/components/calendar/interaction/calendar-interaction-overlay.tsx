import type { CSSProperties } from "react";
import type { CalendarInteractionPreview } from "@/lib/calendar/interaction/calendar-interaction-state";
import {
  previewStyleHorizontal,
  previewStyleVertical,
} from "@/lib/calendar/interaction/calendar-interaction-math";
import { cn } from "@/lib/utils";
import {
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
  CALENDAR_HOUR_ROW_HEIGHT_PX,
} from "@/lib/calendar/constants/calendar-time-grid-config";

type CalendarInteractionOverlayProps = {
  preview: CalendarInteractionPreview | null;
  axis: "vertical" | "horizontal";
  label?: string;
  className?: string;
  hourRowHeight?: number;
};

export function CalendarInteractionOverlay({
  preview,
  axis,
  label,
  className,
  hourRowHeight = CALENDAR_HOUR_ROW_HEIGHT_PX,
}: CalendarInteractionOverlayProps) {
  if (!preview) return null;

  const style: CSSProperties =
    axis === "vertical"
      ? previewStyleVertical(
          preview.slotStart,
          preview.durationMinutes,
          CALENDAR_DAY_START_HOUR,
          CALENDAR_DAY_END_HOUR,
          hourRowHeight,
        )
      : previewStyleHorizontal(
          preview.slotStart,
          preview.durationMinutes,
          CALENDAR_DAY_START_HOUR,
          CALENDAR_DAY_END_HOUR,
        );

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute z-30 rounded-md border-2 border-dashed border-primary/70 bg-primary/10",
        axis === "vertical" ? "inset-x-1.5" : "top-1 bottom-1",
        className,
      )}
      style={style}
    >
      <div className="px-2 py-1 text-[10px] font-medium text-primary">
        {label ?? `${preview.slotStart} – ${preview.slotEnd}`}
      </div>
    </div>
  );
}
