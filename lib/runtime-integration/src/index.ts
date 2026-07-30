import type { SupabaseClient } from "@supabase/supabase-js";
import { EnterpriseRuntimeCoordinator } from "./coordinator/enterprise-runtime-coordinator.js";
import { RuntimePolicyEngine } from "./engines/runtime-policy-engine.js";
import { NoopRuntimeTelemetryPort, type RuntimeTelemetryPort } from "./ports/observability-port.js";
import type { RuntimeEnginePorts } from "./ports/runtime-ports.js";
import {
  createSupabaseRuntimeErrorRepository,
  createSupabaseRuntimeExecutionRepository,
  createSupabaseRuntimePolicyRepository,
  createSupabaseRuntimeSessionRepository,
  createSupabaseRuntimeStepRepository,
} from "./repositories/supabase-runtime-repositories.js";

export type RuntimeIntegrationServicesOptions = {
  ports: RuntimeEnginePorts;
  telemetry?: RuntimeTelemetryPort;
};

export type RuntimeIntegrationServices = {
  policy: RuntimePolicyEngine;
  coordinator: EnterpriseRuntimeCoordinator;
};

export function createRuntimeIntegrationServices(
  client: SupabaseClient,
  options: RuntimeIntegrationServicesOptions,
): RuntimeIntegrationServices {
  const policyRepository = createSupabaseRuntimePolicyRepository(client);
  const sessionRepository = createSupabaseRuntimeSessionRepository(client);
  const executionRepository = createSupabaseRuntimeExecutionRepository(client);
  const stepRepository = createSupabaseRuntimeStepRepository(client);
  const errorRepository = createSupabaseRuntimeErrorRepository(client);
  const telemetry = options.telemetry ?? new NoopRuntimeTelemetryPort();

  const policy = new RuntimePolicyEngine(policyRepository);
  const coordinator = new EnterpriseRuntimeCoordinator(
    options.ports,
    policy,
    sessionRepository,
    executionRepository,
    stepRepository,
    errorRepository,
    telemetry,
  );

  return { policy, coordinator };
}

export * from "./constants.js";
export * from "./dto/runtime-dto.js";
export * from "./errors.js";
export * from "./types.js";
export * from "./utils/runtime-utils.js";
export * from "./ports/runtime-ports.js";
export * from "./ports/observability-port.js";
export * from "./repositories/runtime-repositories.js";
export * from "./repositories/supabase-runtime-repositories.js";
export * from "./engines/runtime-policy-engine.js";
export * from "./coordinator/enterprise-runtime-coordinator.js";
export * from "./factory/runtime-engine-ports.js";
