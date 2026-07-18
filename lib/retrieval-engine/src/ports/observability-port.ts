import type { RetrievalTelemetryEvent } from "../types.js";

export interface RetrievalTelemetryPort {
  recordExecution(event: RetrievalTelemetryEvent): Promise<void>;
}

export class NoopRetrievalTelemetryPort implements RetrievalTelemetryPort {
  async recordExecution(): Promise<void> {
    return;
  }
}
