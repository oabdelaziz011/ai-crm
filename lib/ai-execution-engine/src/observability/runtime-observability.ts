export type RuntimeObservabilityEvent = {
  type:
    | "execution_started"
    | "context_built"
    | "prompt_rendered"
    | "gateway_completed"
    | "execution_failed"
    | "cache_hit"
    | "stream_completed";
  executionId: string;
  sessionId: string;
  timestamp: string;
  metrics: Record<string, number | string | boolean | null>;
};

export class RuntimeObservability {
  private readonly events: RuntimeObservabilityEvent[] = [];
  private cacheHits = 0;
  private cacheMisses = 0;

  record(event: Omit<RuntimeObservabilityEvent, "timestamp">): RuntimeObservabilityEvent {
    const record: RuntimeObservabilityEvent = { ...event, timestamp: new Date().toISOString() };
    this.events.push(record);
    return record;
  }

  recordCacheHit() {
    this.cacheHits += 1;
  }

  recordCacheMiss() {
    this.cacheMisses += 1;
  }

  list(): RuntimeObservabilityEvent[] {
    return [...this.events];
  }

  listByExecution(executionId: string): RuntimeObservabilityEvent[] {
    return this.events.filter((event) => event.executionId === executionId);
  }

  summary() {
    const last = this.events.at(-1);
    return {
      eventCount: this.events.length,
      cacheHitRatio: this.cacheHits + this.cacheMisses === 0 ? 0 : this.cacheHits / (this.cacheHits + this.cacheMisses),
      lastExecutionId: last?.executionId ?? null,
    };
  }
}
