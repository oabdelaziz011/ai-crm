import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createBookingDomainStack,
  type AvailabilityEngine,
  type SlotGenerationEngine,
} from "@workspace/scheduling-engine";
import { InMemoryAppointmentQueryCache } from "./cache/in-memory-appointment-query-cache.js";
import type { AppointmentQueryCachePort } from "./cache/appointment-query-cache-port.js";
import { createAppointmentReadPort } from "./adapters/appointment-query-read-port.js";
import { createSchedulingEnginePort } from "./adapters/scheduling-engine-adapter.js";
import type { AppointmentReadPort } from "./ports/appointment-read-port.js";
import type {
  AppointmentAuditPort,
  AppointmentEventPublisherPort,
  AppointmentIdentityPort,
} from "./ports/appointment-platform-ports.js";
import {
  createNoopAppointmentAuditPort,
  createNoopAppointmentEventPublisher,
  createNoopAppointmentIdentityPort,
} from "./ports/noop-ports.js";
import { createSupabaseAppointmentRepository } from "./repositories/supabase-appointment-repository.js";
import { AppointmentCommandService } from "./services/appointment-command-service.js";
import { AppointmentQueryService } from "./services/appointment-query-service.js";
import type { AvailabilityEnginePort, SchedulingEnginePort } from "./ports/scheduling-engine-port.js";

export type AppointmentPlatformServices = {
  commands: AppointmentCommandService;
  queries: AppointmentQueryService;
  reads: AppointmentReadPort;
  /** Underlying scheduling engines — for backward-compatible direct access when needed. */
  scheduling: {
    availabilityEngine: AvailabilityEngine;
    slotGenerationEngine: SlotGenerationEngine;
  };
};

export type CreateAppointmentPlatformServicesOptions = {
  events?: AppointmentEventPublisherPort;
  audit?: AppointmentAuditPort;
  identity?: AppointmentIdentityPort;
  cache?: AppointmentQueryCachePort;
  /** Inject scheduling engines + booking domain to preserve existing event publishers. */
  bookingDomainStack?: {
    availabilityEngine: AvailabilityEngine;
    slotGenerationEngine: SlotGenerationEngine;
    bookingDomain: SchedulingEnginePort;
  };
};

export function createAppointmentPlatformServices(
  client: SupabaseClient,
  options: CreateAppointmentPlatformServicesOptions = {},
): AppointmentPlatformServices {
  const stack = options.bookingDomainStack ?? createBookingDomainStack(client);
  const appointments = createSupabaseAppointmentRepository(client);
  const engine = createSchedulingEnginePort(stack.bookingDomain);
  const events = options.events ?? createNoopAppointmentEventPublisher();
  const audit = options.audit ?? createNoopAppointmentAuditPort();
  const identity = options.identity ?? createNoopAppointmentIdentityPort();
  const cache = options.cache ?? new InMemoryAppointmentQueryCache();

  const availabilityPort: AvailabilityEnginePort = {
    getAvailableSlots: (...args) => stack.slotGenerationEngine.getAvailableSlots(...args),
  };

  const commands = new AppointmentCommandService({ appointments, engine, identity, events, audit });
  const queries = new AppointmentQueryService({ appointments, cache, availability: availabilityPort });
  const reads = createAppointmentReadPort(queries);

  return {
    commands,
    queries,
    reads,
    scheduling: {
      availabilityEngine: stack.availabilityEngine,
      slotGenerationEngine: stack.slotGenerationEngine,
    },
  };
}

export * from "./constants.js";
export * from "./errors.js";
export * from "./types/index.js";
export * from "./events/index.js";
export * from "./ports/index.js";
export * from "./ports/appointment-read-port.js";
export * from "./cache/appointment-query-cache-port.js";
export { InMemoryAppointmentQueryCache } from "./cache/in-memory-appointment-query-cache.js";
export { createAppointmentReadPort } from "./adapters/appointment-query-read-port.js";
export { createSchedulingEnginePort } from "./adapters/scheduling-engine-adapter.js";
export { AppointmentCommandService } from "./services/appointment-command-service.js";
export { AppointmentQueryService } from "./services/appointment-query-service.js";
