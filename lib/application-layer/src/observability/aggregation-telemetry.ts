export type AggregationWarning = Readonly<{
  source: string;
  message: string;
  code?: string;
}>;

export type AggregationTelemetry = Readonly<{
  startedAt: string;
  completedAt: string;
  durationMs: number;
  repositoryCalls: number;
  cacheHits: number;
  failures: number;
  warnings: readonly AggregationWarning[];
}>;

export type AggregationTelemetryCollector = {
  markRepositoryCall(): void;
  markCacheHit(): void;
  markFailure(): void;
  addWarning(source: string, message: string, code?: string): void;
  finish(): AggregationTelemetry;
};

export function createAggregationTelemetryCollector(): AggregationTelemetryCollector {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  let repositoryCalls = 0;
  let cacheHits = 0;
  let failures = 0;
  const warnings: AggregationWarning[] = [];

  return {
    markRepositoryCall() {
      repositoryCalls += 1;
    },
    markCacheHit() {
      cacheHits += 1;
    },
    markFailure() {
      failures += 1;
    },
    addWarning(source, message, code) {
      warnings.push(Object.freeze({ source, message, code }));
    },
    finish() {
      return Object.freeze({
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startMs,
        repositoryCalls,
        cacheHits,
        failures,
        warnings: Object.freeze([...warnings]),
      });
    },
  };
}
