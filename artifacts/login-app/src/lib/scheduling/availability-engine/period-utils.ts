import type { LocalTimePeriod } from "@/lib/scheduling/availability-engine/types";

export type MinutePeriod = { start: number; end: number };

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseTimeToMinutes(time: string): number {
  const match = TIME_PATTERN.exec(time.trim());
  if (!match) {
    throw new Error("INVALID_TIME");
  }
  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
}

export function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function toMinutePeriod(start: string, end: string): MinutePeriod {
  const startMin = parseTimeToMinutes(start);
  const endMin = parseTimeToMinutes(end);
  if (startMin >= endMin) {
    throw new Error("INVALID_PERIOD");
  }
  return { start: startMin, end: endMin };
}

export function toLocalTimePeriod(period: MinutePeriod): LocalTimePeriod {
  return {
    start: formatMinutesToTime(period.start),
    end: formatMinutesToTime(period.end),
  };
}

export function subtractMinutePeriod(
  periods: MinutePeriod[],
  removal: MinutePeriod,
): MinutePeriod[] {
  const result: MinutePeriod[] = [];
  for (const period of periods) {
    if (removal.end <= period.start || removal.start >= period.end) {
      result.push(period);
      continue;
    }
    if (removal.start > period.start) {
      result.push({ start: period.start, end: Math.min(removal.start, period.end) });
    }
    if (removal.end < period.end) {
      result.push({ start: Math.max(removal.end, period.start), end: period.end });
    }
  }
  return mergeMinutePeriods(result);
}

export function subtractMinutePeriods(
  periods: MinutePeriod[],
  removals: MinutePeriod[],
): MinutePeriod[] {
  return removals.reduce((acc, removal) => subtractMinutePeriod(acc, removal), periods);
}

export function mergeMinutePeriods(periods: MinutePeriod[]): MinutePeriod[] {
  if (periods.length === 0) return [];
  const sorted = [...periods].sort((a, b) => a.start - b.start);
  const merged: MinutePeriod[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged.filter((p) => p.end > p.start);
}

export function localPeriodsFromMinutes(periods: MinutePeriod[]): LocalTimePeriod[] {
  return periods.map(toLocalTimePeriod);
}
