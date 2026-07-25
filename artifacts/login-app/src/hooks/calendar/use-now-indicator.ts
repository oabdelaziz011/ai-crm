import { useEffect, useMemo } from "react";
import { NowIndicatorService } from "@/lib/calendar/interaction/now-indicator-service";
import {
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
} from "@/lib/calendar/constants/calendar-time-grid-config";

const nowService = new NowIndicatorService();

export function useNowIndicator(
  displayTimezone: string,
  anchorDate: string,
  gridSizePx: number,
  scrollContainerRef: React.RefObject<HTMLElement | null>,
  startHour = CALENDAR_DAY_START_HOUR,
  endHour = CALENDAR_DAY_END_HOUR,
  scrollNonce = 0,
  orientation: "vertical" | "horizontal" = "vertical",
) {
  const nowPercent = useMemo(
    () => nowService.getNowPercent(displayTimezone, startHour, endHour),
    [displayTimezone, endHour, startHour],
  );

  const isToday = useMemo(
    () => nowService.shouldAutoScroll(anchorDate, displayTimezone),
    [anchorDate, displayTimezone],
  );

  useEffect(() => {
    if (!isToday || !scrollContainerRef.current || gridSizePx <= 0) return;
    const viewport = scrollContainerRef.current;
    if (orientation === "horizontal") {
      const left = nowService.scrollLeftForNow(
        gridSizePx,
        displayTimezone,
        startHour,
        endHour,
        viewport.clientWidth,
      );
      if (left != null) viewport.scrollLeft = left;
      return;
    }
    const top = nowService.scrollTopForNow(
      gridSizePx,
      displayTimezone,
      startHour,
      endHour,
      viewport.clientHeight,
    );
    if (top != null) viewport.scrollTop = top;
  }, [
    displayTimezone,
    endHour,
    gridSizePx,
    isToday,
    orientation,
    scrollContainerRef,
    scrollNonce,
    startHour,
  ]);

  return { nowPercent, isToday };
}

export { nowService };
