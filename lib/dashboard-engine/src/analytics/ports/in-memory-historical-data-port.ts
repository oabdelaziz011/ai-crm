import type { DashboardHistoricalBucket } from "../analytics-types.js";
import type {
  DashboardHistoricalDataPort,
  DashboardHistoricalDataRequest,
} from "./dashboard-historical-data-port.js";

export type InMemoryHistoricalSeed = Record<
  string,
  Record<string, DashboardHistoricalBucket[]>
>;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function generateSyntheticBuckets(
  metricKey: string,
  request: DashboardHistoricalDataRequest,
  baseValue: number,
): DashboardHistoricalBucket[] {
  const start = new Date(request.periodStart);
  const end = new Date(request.periodEnd);
  const buckets: DashboardHistoricalBucket[] = [];
  let cursor = new Date(start);
  let index = 0;

  while (cursor <= end) {
    const nextDay = new Date(cursor);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const wave = Math.sin(index / 3) * 0.15 + 1;
    buckets.push({
      metricKey,
      periodStart: cursor.toISOString(),
      periodEnd: new Date(nextDay.getTime() - 1).toISOString(),
      value: Math.max(0, Math.round(baseValue * wave)),
    });
    cursor = nextDay;
    index += 1;
  }

  return buckets;
}

export function createInMemoryDashboardHistoricalDataPort(
  seed: InMemoryHistoricalSeed = {},
  baseValues: Record<string, number> = {},
): DashboardHistoricalDataPort {
  return {
    async fetchPeriodBuckets(request: DashboardHistoricalDataRequest): Promise<DashboardHistoricalBucket[]> {
      const companySeed = seed[request.companyId] ?? {};
      const buckets: DashboardHistoricalBucket[] = [];

      for (const metricKey of request.metricKeys) {
        const metricSeed = companySeed[metricKey] ?? [];
        const filtered = metricSeed.filter((bucket) => {
          const start = new Date(bucket.periodStart).getTime();
          return start >= new Date(request.periodStart).getTime()
            && start <= new Date(request.periodEnd).getTime();
        });

        if (filtered.length > 0) {
          buckets.push(...filtered);
          continue;
        }

        const baseValue = baseValues[metricKey] ?? 10;
        buckets.push(...generateSyntheticBuckets(metricKey, request, baseValue));
      }

      return buckets.sort(
        (left, right) => new Date(left.periodStart).getTime() - new Date(right.periodStart).getTime(),
      );
    },
  };
}

export function seedDailyMetric(
  metricKey: string,
  days: Array<{ date: string; value: number }>,
): DashboardHistoricalBucket[] {
  return days.map((day) => ({
    metricKey,
    periodStart: `${day.date}T00:00:00.000Z`,
    periodEnd: `${day.date}T23:59:59.999Z`,
    value: day.value,
  }));
}

export { dayKey };
