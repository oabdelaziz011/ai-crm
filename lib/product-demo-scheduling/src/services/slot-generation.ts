/**
 * Pure helpers for generating draft/publishable demo slots from availability windows.
 * Does not book. Does not touch clinic scheduling.
 */

export type GeneratedSlotCandidate = {
  presenterUserId: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
};

function parseHm(value: string): { h: number; m: number; s: number } {
  const [h, m, s] = value.split(":").map((part) => Number(part));
  return { h: h || 0, m: m || 0, s: s || 0 };
}

/** Build UTC Date for a local civil date + HH:MM in a fixed-offset approximation.
 * Callers should pass timezone labels for storage; generation uses the wall-clock
 * components and treats them as absolute when timezone is UTC, otherwise embeds
 * the civil time as ISO without shifting (staff publish flow revalidates).
 */
function civilDateTime(dateYmd: string, hm: string): Date {
  const { h, m, s } = parseHm(hm);
  return new Date(`${dateYmd}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.000Z`);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function ymdInUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function weekdayUtc(date: Date): number {
  return date.getUTCDay();
}

export function generateSlotCandidates(input: {
  windows: Array<{
    weekday: number;
    startTime: string;
    endTime: string;
    timezone: string;
    presenterUserId: string | null;
    isActive: boolean;
  }>;
  presenterUserIds: string[];
  durationMinutes: number;
  bufferMinutes: number;
  fromDate: Date;
  daysAhead: number;
  /** When set, only these civil dates (YYYY-MM-DD) are generated. */
  dates?: string[];
  timezone: string;
}): GeneratedSlotCandidate[] {
  const presenters = [...new Set(input.presenterUserIds.filter(Boolean))];
  if (!presenters.length || input.durationMinutes <= 0) return [];

  const activeWindows = input.windows.filter((w) => w.isActive);
  if (!activeWindows.length) return [];

  const out: GeneratedSlotCandidate[] = [];
  const step = input.durationMinutes + Math.max(0, input.bufferMinutes);
  const startDay = new Date(Date.UTC(
    input.fromDate.getUTCFullYear(),
    input.fromDate.getUTCMonth(),
    input.fromDate.getUTCDate(),
  ));
  const explicitDates = (input.dates ?? [])
    .map((value) => value.trim())
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
  const ymds = explicitDates.length
    ? [...new Set(explicitDates)].sort()
    : Array.from({ length: Math.max(0, input.daysAhead) }, (_, dayOffset) =>
        ymdInUtc(addMinutes(startDay, dayOffset * 24 * 60)),
      );

  for (const ymd of ymds) {
    const weekday = weekdayUtc(new Date(`${ymd}T00:00:00.000Z`));
    const dayWindows = activeWindows.filter((w) => w.weekday === weekday);
    for (const window of dayWindows) {
      const windowPresenters = window.presenterUserId
        ? presenters.filter((id) => id === window.presenterUserId)
        : presenters;
      if (!windowPresenters.length) continue;

      let cursor = civilDateTime(ymd, window.startTime);
      const windowEnd = civilDateTime(ymd, window.endTime);
      while (addMinutes(cursor, input.durationMinutes) <= windowEnd) {
        const endAt = addMinutes(cursor, input.durationMinutes);
        if (endAt.getTime() > Date.now()) {
          for (const presenterUserId of windowPresenters) {
            out.push({
              presenterUserId,
              startAt: new Date(cursor),
              endAt,
              timezone: window.timezone || input.timezone,
            });
          }
        }
        cursor = addMinutes(cursor, step);
      }
    }
  }

  out.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return out;
}

export function isSlotBookableNow(input: {
  status: string;
  startAt: string;
  bookedCount: number;
  capacity: number;
  now?: Date;
}): boolean {
  if (input.status !== "published") return false;
  if (input.bookedCount >= input.capacity) return false;
  const start = new Date(input.startAt).getTime();
  if (!Number.isFinite(start)) return false;
  return start > (input.now ?? new Date()).getTime();
}

export function sortBookableNearestFirst<T extends { startAt: string }>(slots: T[]): T[] {
  return [...slots].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
}
