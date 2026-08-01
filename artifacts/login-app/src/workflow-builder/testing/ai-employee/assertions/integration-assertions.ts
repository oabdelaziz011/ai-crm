import type {
  AiEmployeeIntegrationAssertionResult,
  AiEmployeeIntegrationScenarioResult,
  AiEmployeeIntegrationTelemetrySnapshot,
} from "../types/ai-employee-integration-types";

export function assertCondition(
  id: string,
  label: string,
  condition: boolean,
  message: string,
): AiEmployeeIntegrationAssertionResult {
  return { id, label, passed: condition, message: condition ? "ok" : message };
}

export function collectFailures(assertions: AiEmployeeIntegrationAssertionResult[]): string[] {
  return assertions.filter((assertion) => !assertion.passed).map((assertion) => assertion.message);
}

export function buildScenarioResult(input: {
  scenarioId: AiEmployeeIntegrationScenarioResult["scenarioId"];
  scenarioName: string;
  startedMs: number;
  assertions: AiEmployeeIntegrationAssertionResult[];
  telemetry: AiEmployeeIntegrationTelemetrySnapshot;
  details?: Record<string, unknown>;
}): AiEmployeeIntegrationScenarioResult {
  const failures = collectFailures(input.assertions);
  return {
    scenarioId: input.scenarioId,
    scenarioName: input.scenarioName,
    status: failures.length === 0 ? "passed" : "failed",
    durationMs: Date.now() - input.startedMs,
    assertions: input.assertions,
    failures,
    telemetry: input.telemetry,
    details: input.details ?? {},
  };
}

export function scoreReadiness(results: AiEmployeeIntegrationScenarioResult[]): number {
  if (results.length === 0) return 0;
  const passed = results.filter((result) => result.status === "passed").length;
  return Math.round((passed / results.length) * 100);
}
