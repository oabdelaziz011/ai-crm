import type { ApplicationPorts } from "../ports/repository-ports.js";
import type { AnalyticsFilter } from "../ports/repository-ports.js";
import type { DashboardProjectionDto } from "../dto/query-dtos.js";
import { createAggregationTelemetryCollector } from "../observability/aggregation-telemetry.js";

export type ExecutiveDashboardAggregatorInput = Readonly<{
  templateKey?: string;
  filter: AnalyticsFilter;
}>;

function formatKpiValue(kpi: { value: number; unit?: string }, currency: string): string {
  if (kpi.unit === "currency") {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(kpi.value / 100);
  }
  if (kpi.unit === "percent") return `${kpi.value.toFixed(1)}%`;
  if (kpi.unit === "minutes") return `${Math.round(kpi.value)}m`;
  if (kpi.unit === "hours") return `${kpi.value.toFixed(1)}h`;
  return String(Math.round(kpi.value));
}

function trendLabel(current: number, previous?: number): string | undefined {
  if (previous == null || previous === 0) return undefined;
  const delta = ((current - previous) / previous) * 100;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(0)}%`;
}

/** Parallel executive dashboard aggregation — all metrics via application ports. */
export class ExecutiveDashboardAggregator {
  constructor(private readonly deps: Readonly<{ ports: ApplicationPorts }>) {}

  async aggregate(
    tenantId: string,
    input: ExecutiveDashboardAggregatorInput,
  ): Promise<DashboardProjectionDto> {
    const telemetry = createAggregationTelemetryCollector();
    telemetry.markRepositoryCall();

    const snapshot = await this.deps.ports.analyticsRead.getExecutiveSnapshot(tenantId, input.filter);

    const kpis = snapshot.kpis.map((kpi) =>
      Object.freeze({
        id: kpi.key,
        label: kpi.label,
        value: formatKpiValue(kpi, snapshot.currency),
        trend: trendLabel(kpi.value, kpi.previousValue),
        tone:
          kpi.key.includes("outstanding") || kpi.key.includes("no_show") || kpi.key.includes("cancelled")
            ? ("warning" as const)
            : ("default" as const),
      }),
    );

    const widgets = Object.freeze([
      Object.freeze({
        widgetId: "executive_overview",
        title: "Executive Overview",
        cards: kpis.slice(0, 8),
      }),
      Object.freeze({
        widgetId: "executive_operations",
        title: "Operations",
        cards: kpis.filter((k) => k.id.startsWith("operations.") || k.id.startsWith("bookings.")),
      }),
      Object.freeze({
        widgetId: "executive_finance",
        title: "Finance",
        cards: kpis.filter((k) => k.id.startsWith("finance.") || k.id.startsWith("payments.")),
      }),
    ]);

    const finished = telemetry.finish();

    return Object.freeze({
      widgets,
      period: input.filter.period ?? "today",
      kpis,
      charts: snapshot.charts,
      rankings: snapshot.rankings,
      telemetry: Object.freeze({
        durationMs: finished.durationMs,
        repositoryCalls: finished.repositoryCalls,
        cacheHits: finished.cacheHits,
        failures: finished.failures,
      }),
    });
  }
}
