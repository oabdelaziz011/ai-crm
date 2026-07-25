/** Shared time scale used by Day, Week, and Timeline views. */
export const CALENDAR_DAY_START_HOUR = 6;
export const CALENDAR_DAY_END_HOUR = 22;
export const CALENDAR_HOUR_ROW_HEIGHT_PX = 56;
export const CALENDAR_TIMELINE_HOUR_WIDTH_PX = 80;
export const CALENDAR_TIMELINE_RESOURCE_LABEL_WIDTH_PX = 160;
export const CALENDAR_TIMELINE_BASE_LANE_HEIGHT_PX = 64;
export const CALENDAR_TIMELINE_STACK_LANE_HEIGHT_PX = 28;

export function getCalendarVisibleHours(
  startHour = CALENDAR_DAY_START_HOUR,
  endHour = CALENDAR_DAY_END_HOUR,
): number[] {
  return Array.from({ length: 24 }, (_, index) => index).filter(
    (hour) => hour >= startHour && hour < endHour,
  );
}

export function displayTimeToMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function getCalendarDayTotalMinutes(
  startHour = CALENDAR_DAY_START_HOUR,
  endHour = CALENDAR_DAY_END_HOUR,
): number {
  return (endHour - startHour) * 60;
}

export function getCalendarTimeAxisWidth(
  startHour = CALENDAR_DAY_START_HOUR,
  endHour = CALENDAR_DAY_END_HOUR,
): number {
  return getCalendarVisibleHours(startHour, endHour).length * CALENDAR_TIMELINE_HOUR_WIDTH_PX;
}

export function getCalendarTimeGridHeight(
  startHour = CALENDAR_DAY_START_HOUR,
  endHour = CALENDAR_DAY_END_HOUR,
  headerOffset = 0,
): number {
  return getCalendarVisibleHours(startHour, endHour).length * CALENDAR_HOUR_ROW_HEIGHT_PX + headerOffset;
}
