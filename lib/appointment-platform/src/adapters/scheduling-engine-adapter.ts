import type { SchedulingEnginePort } from "../ports/scheduling-engine-port.js";

/** Wraps any booking domain implementation that matches SchedulingEnginePort — no duplicated logic. */
export function createSchedulingEnginePort(bookingDomain: SchedulingEnginePort): SchedulingEnginePort {
  return bookingDomain;
}
