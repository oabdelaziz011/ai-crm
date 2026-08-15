import {
  displayTimeToMinutes,
  getCalendarDayTotalMinutes,
} from "@/lib/calendar/constants/calendar-time-grid-config";

export function minutesToDisplayTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(totalMinutes, 24 * 60 - 1));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function snapMinutes(value: number, intervalMinutes: number): number {
  if (intervalMinutes <= 1) return value;
  return Math.round(value / intervalMinutes) * intervalMinutes;
}

export function verticalDeltaToMinutes(
  deltaPx: number,
  gridHeightPx: number,
  startHour: number,
  endHour: number,
): number {
  const totalMinutes = getCalendarDayTotalMinutes(startHour, endHour);
  return (deltaPx / gridHeightPx) * totalMinutes;
}

export function horizontalDeltaToMinutes(
  deltaPx: number,
  gridWidthPx: number,
  startHour: number,
  endHour: number,
): number {
  const totalMinutes = getCalendarDayTotalMinutes(startHour, endHour);
  return (deltaPx / gridWidthPx) * totalMinutes;
}

export function previewStyleVertical(
  slotStart: string,
  durationMinutes: number,
  startHour: number,
  endHour: number,
  hourRowHeightPx = 56,
): { top: string; height: string; left: string; right: string } {
  const dayStartMinutes = startHour * 60;
  const startMinutes = displayTimeToMinutes(slotStart);
  const topPx = ((startMinutes - dayStartMinutes) / 60) * hourRowHeightPx;
  const heightPx = Math.max((Math.max(durationMinutes, 15) / 60) * hourRowHeightPx, 28);
  void endHour;
  return {
    top: `${Math.max(0, topPx)}px`,
    height: `${heightPx}px`,
    left: "6px",
    right: "6px",
  };
}

export function previewStyleHorizontal(
  slotStart: string,
  durationMinutes: number,
  startHour: number,
  endHour: number,
): { left: string; width: string } {
  const dayStartMinutes = startHour * 60;
  const totalMinutes = getCalendarDayTotalMinutes(startHour, endHour);
  const startMinutes = displayTimeToMinutes(slotStart);
  const left = ((startMinutes - dayStartMinutes) / totalMinutes) * 100;
  const width = Math.max((durationMinutes / totalMinutes) * 100, 2);
  return {
    left: `${Math.max(0, left)}%`,
    width: `${Math.min(width, 100 - Math.max(0, left))}%`,
  };
}
