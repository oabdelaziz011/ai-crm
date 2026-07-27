import {
  CALENDAR_DAY_END_HOUR,
  CALENDAR_DAY_START_HOUR,
  displayTimeToMinutes,
} from "@/lib/calendar/constants/calendar-time-grid-config";

export function generateDaySlotIntervals(
  slotIntervalMinutes: number,
  startHour = CALENDAR_DAY_START_HOUR,
  endHour = CALENDAR_DAY_END_HOUR,
): Array<{ startTime: string; endTime: string; startMinutes: number; endMinutes: number }> {
  const slots: Array<{
    startTime: string;
    endTime: string;
    startMinutes: number;
    endMinutes: number;
  }> = [];

  const dayStartMinutes = startHour * 60;
  const dayEndMinutes = endHour * 60;

  for (let start = dayStartMinutes; start + slotIntervalMinutes <= dayEndMinutes; start += slotIntervalMinutes) {
    const end = start + slotIntervalMinutes;
    slots.push({
      startMinutes: start,
      endMinutes: end,
      startTime: minutesToDisplayTime(start),
      endTime: minutesToDisplayTime(end),
    });
  }

  return slots;
}

export function minutesToDisplayTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function instantToLocalMinutes(iso: string, timezone: string): number {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return displayTimeToMinutes(time);
}

export function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}
