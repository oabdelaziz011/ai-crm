import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";
import {
  displayTimeToMinutes,
  getCalendarDayTotalMinutes,
} from "@/lib/calendar/constants/calendar-time-grid-config";

export class NowIndicatorService {
  localToday(timezone: string, now = new Date()): string {
    return TimezoneResolver.localDateForInstant(now, timezone);
  }

  localNowTime(timezone: string, now = new Date()): string {
    return TimezoneResolver.localTimeForInstant(now, timezone);
  }

  /** Percentage position within the visible day grid, or null when outside range. */
  getNowPercent(
    timezone: string,
    startHour: number,
    endHour: number,
    now = new Date(),
  ): number | null {
    const nowTime = this.localNowTime(timezone, now);
    const nowMinutes = displayTimeToMinutes(nowTime);
    const dayStart = startHour * 60;
    const dayEnd = endHour * 60;
    if (nowMinutes < dayStart || nowMinutes > dayEnd) return null;
    const total = getCalendarDayTotalMinutes(startHour, endHour);
    return ((nowMinutes - dayStart) / total) * 100;
  }

  shouldAutoScroll(date: string, timezone: string, now = new Date()): boolean {
    return date === this.localToday(timezone, now);
  }

  scrollTopForNow(
    gridHeightPx: number,
    timezone: string,
    startHour: number,
    endHour: number,
    viewportHeight: number,
    now = new Date(),
  ): number | null {
    const percent = this.getNowPercent(timezone, startHour, endHour, now);
    if (percent == null) return null;
    const target = (percent / 100) * gridHeightPx - viewportHeight / 3;
    return Math.max(0, target);
  }

  scrollLeftForNow(
    gridWidthPx: number,
    timezone: string,
    startHour: number,
    endHour: number,
    viewportWidth: number,
    now = new Date(),
  ): number | null {
    const percent = this.getNowPercent(timezone, startHour, endHour, now);
    if (percent == null) return null;
    const target = (percent / 100) * gridWidthPx - viewportWidth / 3;
    return Math.max(0, target);
  }
}
