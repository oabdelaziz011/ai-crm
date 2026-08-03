import type { AppointmentMetricsSnapshot } from "../types/appointment-types.js";

export interface AppointmentQueryCachePort {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs: number): void;
  invalidate(prefix: string): void;
}

export function buildAppointmentQueryCacheKey(scope: string, parts: Record<string, unknown>): string {
  return `appointment:${scope}:${JSON.stringify(parts)}`;
}

export type CachedMetrics = AppointmentMetricsSnapshot;
