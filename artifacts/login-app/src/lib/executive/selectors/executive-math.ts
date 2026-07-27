import type { TrendDirection } from "@/lib/executive/types/executive-enums";

export function computeTrend(current: number, previous: number): {
  trend: TrendDirection;
  changePercent: number;
} {
  if (previous === 0) {
    return { trend: current > 0 ? "up" : "flat", changePercent: current > 0 ? 100 : 0 };
  }
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 1) return { trend: "flat", changePercent: Math.round(change) };
  return { trend: change > 0 ? "up" : "down", changePercent: Math.round(change) };
}

export function rankBy<T>(items: T[], scoreFn: (item: T) => number): Array<T & { ranking: number }> {
  const sorted = [...items].sort((a, b) => scoreFn(b) - scoreFn(a));
  return sorted.map((item, index) => ({ ...item, ranking: index + 1 }));
}

export function healthScore(metrics: {
  occupancy: number;
  cancellationRate: number;
  noShowRate: number;
  waitMinutes: number;
}): number {
  const occupancyScore = Math.min(100, metrics.occupancy);
  const cancelPenalty = Math.min(30, metrics.cancellationRate);
  const noShowPenalty = Math.min(30, metrics.noShowRate);
  const waitPenalty = Math.min(20, metrics.waitMinutes / 3);
  return Math.max(0, Math.round(occupancyScore - cancelPenalty - noShowPenalty - waitPenalty));
}

export function linearForecast(history: number[], horizonDays: number): number[] {
  if (history.length === 0) return Array(horizonDays).fill(0);
  if (history.length === 1) return Array(horizonDays).fill(history[0]!);

  const n = history.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += history[i]!;
    sumXY += i * history[i]!;
    sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;

  return Array.from({ length: horizonDays }, (_, i) =>
    Math.max(0, Math.round(intercept + slope * (n + i))),
  );
}

export function movingAverage(values: number[], window = 7): number {
  if (values.length === 0) return 0;
  const slice = values.slice(-window);
  return Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
}

export function percentRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

export function averageMinutes(durations: number[]): number {
  if (durations.length === 0) return 0;
  return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
}
