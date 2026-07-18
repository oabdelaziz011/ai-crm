import type { EmbeddingTelemetryEvent } from "../types.js";

export interface EmbeddingTelemetryPort {
  recordExecution(event: EmbeddingTelemetryEvent): Promise<void>;
}

export class NoopEmbeddingTelemetryPort implements EmbeddingTelemetryPort {
  async recordExecution(): Promise<void> {
    return;
  }
}

export class InMemoryEmbeddingTelemetryPort implements EmbeddingTelemetryPort {
  readonly events: EmbeddingTelemetryEvent[] = [];

  async recordExecution(event: EmbeddingTelemetryEvent): Promise<void> {
    this.events.push(event);
  }
}
