export type MetricLabels = Record<string, string | number | boolean>;

export type StructuredLogFields = {
  event: string;
  level?: "debug" | "info" | "warn" | "error";
  labels?: MetricLabels;
  detail?: unknown;
};

export class PlatformMetricsRegistry {
  private readonly counters = new Map<string, number>();

  increment(name: string, value = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value);
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.counters.entries());
  }
}

export const platformMetrics = new PlatformMetricsRegistry();

export function logStructured(fields: StructuredLogFields): void {
  const payload = {
    ts: new Date().toISOString(),
    level: fields.level ?? "info",
    event: fields.event,
    labels: fields.labels ?? {},
    detail: fields.detail,
  };
  console.log(JSON.stringify(payload));
}

export type AlertHook = (input: {
  name: string;
  severity: "warning" | "critical";
  message: string;
  labels?: MetricLabels;
}) => void;

let alertHook: AlertHook | null = null;

export function registerAlertHook(hook: AlertHook): void {
  alertHook = hook;
}

export function emitAlert(input: {
  name: string;
  severity: "warning" | "critical";
  message: string;
  labels?: MetricLabels;
}): void {
  logStructured({
    event: "platform.alert",
    level: input.severity === "critical" ? "error" : "warn",
    labels: { name: input.name, severity: input.severity, ...(input.labels ?? {}) },
    detail: input.message,
  });
  alertHook?.(input);
}

export function initOpenTelemetry(endpoint?: string | null): { enabled: boolean } {
  if (!endpoint?.trim()) {
    return { enabled: false };
  }

  logStructured({
    event: "otel.bootstrap",
    detail: { endpoint, note: "Export via OTEL_EXPORTER_OTLP_ENDPOINT compatible collector." },
  });

  return { enabled: true };
}
