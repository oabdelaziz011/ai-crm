import type { ExecutiveChartPoint } from "@/lib/dashboard";
import type { WorkflowTrendPoint } from "../types/analytics-types";

export function mapTrendPointsToChartSeries(points: readonly WorkflowTrendPoint[]): ExecutiveChartPoint[] {
  return points.map((point) => ({
    label: point.label,
    value: point.successes,
  }));
}

export function mapFailureTrendToChartSeries(points: readonly WorkflowTrendPoint[]): ExecutiveChartPoint[] {
  return points.map((point) => ({
    label: point.label,
    value: point.failures,
  }));
}

export function mapReadinessTrendToChartSeries(points: readonly WorkflowTrendPoint[]): ExecutiveChartPoint[] {
  return points.map((point) => ({
    label: point.label,
    value: point.readinessScore ?? 0,
  }));
}
