import type { VectorQueryTelemetryEvent } from "../types.js";

export interface VectorQueryTelemetryPort {
  recordExecution(event: VectorQueryTelemetryEvent): Promise<void>;
}

export class NoopVectorQueryTelemetryPort implements VectorQueryTelemetryPort {
  async recordExecution(): Promise<void> {
    return;
  }
}
