import {
  createConfiguredPlatformEventBus,
  createDefaultSubscribers,
  type PlatformEventBus,
} from "@workspace/platform-events";
import type { ApplicationPorts } from "../ports/repository-ports.js";
import type { InfrastructurePorts } from "../ports/infrastructure-ports.js";
import { createApplicationServices, type ApplicationServices, type ApplicationLayerDeps } from "../services/application-services.js";
import { createMockApplicationPorts } from "../testing/mock-ports.js";
import {
  createEventPublisherPort,
  createMockAuditWriterPort,
  createMockIdempotencyPort,
} from "../orchestrators/event-publisher-adapter.js";
import { CommandPipeline, QueryPipeline } from "../pipeline/command-query-pipeline.js";

export type ServiceToken =
  | "ports"
  | "infra"
  | "eventBus"
  | "commandPipeline"
  | "queryPipeline"
  | "services"
  | "customer360"
  | "operations"
  | "booking"
  | "payment"
  | "invoice"
  | "timeline"
  | "dashboard"
  | "analytics"
  | "notification"
  | "workspace"
  | "customer"
  | "task"
  | "ai"
  | "knowledge"
  | "configuration"
  | "featureFlags"
  | "licensing";

export type ApplicationLayerRegistry = Readonly<{
  resolve<T>(token: ServiceToken): T;
  getServices(): ApplicationServices;
}>;

export type ApplicationLayerRegistryOptions = Readonly<{
  ports?: ApplicationPorts;
  eventBus?: PlatformEventBus;
  useMockPorts?: boolean;
  runtimeCoordinator?: import("../ports/ai-runtime-port.js").EnterpriseRuntimeCoordinatorPort;
  internalEnterpriseRuntime?: import("../ports/ai-runtime-port.js").EnterpriseRuntimeInternalPort;
}>;

/** DI registry — no singleton globals. Each registry instance owns its dependency graph. */
export function createApplicationLayerRegistry(
  options: ApplicationLayerRegistryOptions = {},
): ApplicationLayerRegistry {
  const ports = options.ports ?? (options.useMockPorts !== false ? createMockApplicationPorts() : undefined);
  if (!ports) throw new Error("ApplicationPorts required — provide ports or enable useMockPorts");

  const eventBus = options.eventBus ?? createConfiguredPlatformEventBus(createDefaultSubscribers(), { awaitSubscribers: true });
  const infra: InfrastructurePorts = Object.freeze({
    events: createEventPublisherPort(eventBus),
    audit: createMockAuditWriterPort(),
    idempotency: createMockIdempotencyPort(),
  });

  const commandPipeline = new CommandPipeline({ audit: infra.audit, idempotency: infra.idempotency });
  const queryPipeline = new QueryPipeline();

  const deps: ApplicationLayerDeps = Object.freeze({
    ports,
    infra,
    commandPipeline,
    queryPipeline,
    runtimeCoordinator: options.runtimeCoordinator,
    internalEnterpriseRuntime: options.internalEnterpriseRuntime,
  });

  const services = createApplicationServices(deps);

  const registry = new Map<ServiceToken, unknown>([
    ["ports", ports],
    ["infra", infra],
    ["eventBus", eventBus],
    ["commandPipeline", commandPipeline],
    ["queryPipeline", queryPipeline],
    ["services", services],
    ["customer360", services.customer360],
    ["operations", services.operations],
    ["booking", services.booking],
    ["payment", services.payment],
    ["invoice", services.invoice],
    ["timeline", services.timeline],
    ["dashboard", services.dashboard],
    ["analytics", services.analytics],
    ["notification", services.notification],
    ["workspace", services.workspace],
    ["customer", services.customer],
    ["task", services.task],
    ["ai", services.ai],
    ["knowledge", services.knowledge],
    ["configuration", services.configuration],
    ["featureFlags", services.featureFlags],
    ["licensing", services.licensing],
  ]);

  return Object.freeze({
    resolve<T>(token: ServiceToken): T {
      const value = registry.get(token);
      if (value === undefined) throw new Error(`Unknown service token: ${token}`);
      return value as T;
    },
    getServices() {
      return services;
    },
  });
}
