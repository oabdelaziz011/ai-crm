import type { RuntimeTelemetryEvent } from "../types.js";

export interface RuntimeTelemetryPort {
  recordExecution(event: RuntimeTelemetryEvent): Promise<void>;
}

export class NoopRuntimeTelemetryPort implements RuntimeTelemetryPort {
  async recordExecution(): Promise<void> {
    return;
  }
}
