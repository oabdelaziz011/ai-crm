/** @deprecated Use stores/memory-stores.js — re-exported for backward compatibility. */
export {
  createMemoryEventTelemetry as EventTelemetry,
  sharedMemoryEventTelemetry as sharedEventTelemetry,
} from "../stores/memory-stores.js";
export type { SubscriberTelemetryRecord } from "../stores/store-ports.js";

export type SubscriberMetric = {
  subscriberId: string;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
};

export type EventTelemetrySnapshot = ReturnType<
  ReturnType<typeof import("../stores/memory-stores.js").createMemoryEventTelemetry>["snapshot"]
>;
