import {
  differenceInMinutes,
  format,
  isSameDay,
  isYesterday,
  isThisWeek,
} from "date-fns";

export type SmartTimeLabels = {
  justNow: string;
  minutesAgo: (count: number) => string;
  yesterday: string;
};

export function formatSmartTime(
  timestamp: string | Date,
  labels: SmartTimeLabels,
  now: Date = new Date(),
): { display: string; exact: string } {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  const exact = format(date, "PPpp");
  const minutes = differenceInMinutes(now, date);

  if (minutes < 1) {
    return { display: labels.justNow, exact };
  }
  if (minutes < 60) {
    return { display: labels.minutesAgo(minutes), exact };
  }
  if (isSameDay(date, now)) {
    return { display: format(date, "p"), exact };
  }
  if (isYesterday(date)) {
    return { display: labels.yesterday, exact };
  }
  if (isThisWeek(date, { weekStartsOn: 1 })) {
    return { display: format(date, "EEEE"), exact };
  }
  return { display: format(date, "MMM d, yyyy"), exact };
}
