import type {
  AiEmployeeIntegrationRunRecord,
  AiEmployeeIntegrationScenarioId,
  AiEmployeeIntegrationSuite,
} from "../types/ai-employee-integration-types";
import { scoreReadiness } from "../assertions/integration-assertions";
import { INTEGRATION_COMPANY_ID, INTEGRATION_FLOW_ID } from "../fixtures/integration-fixtures";
import { runAiEmployeeIntegrationScenario } from "../scenarios/ai-employee-integration-scenarios";
import { builtInAiEmployeeIntegrationSuites } from "../suites/register-built-in-ai-employee-integration-suites";
import { createTestingId } from "../../utilities/testing-id";

export class AiEmployeeIntegrationTestingService {
  listSuites(): AiEmployeeIntegrationSuite[] {
    return builtInAiEmployeeIntegrationSuites();
  }

  getSuite(suiteId: string): AiEmployeeIntegrationSuite | null {
    return this.listSuites().find((suite) => suite.id === suiteId) ?? null;
  }

  async runSuite(suiteId: string): Promise<AiEmployeeIntegrationRunRecord | null> {
    const suite = this.getSuite(suiteId);
    if (!suite) return null;

    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const scenarioResults = [];

    for (const scenarioId of suite.scenarioIds) {
      scenarioResults.push(await runAiEmployeeIntegrationScenario(scenarioId));
    }

    const passed = scenarioResults.filter((result) => result.status === "passed").length;
    const failed = scenarioResults.filter((result) => result.status === "failed").length;
    const skipped = scenarioResults.filter((result) => result.status === "skipped").length;

    return {
      id: createTestingId("ai-employee-run"),
      suiteId: suite.id,
      suiteName: suite.name,
      companyId: INTEGRATION_COMPANY_ID,
      flowId: INTEGRATION_FLOW_ID,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      passed,
      failed,
      skipped,
      scenarioResults,
      report: {
        passed,
        failed,
        skipped,
        readinessScore: scoreReadiness(scenarioResults),
        exportPayload: {
          suiteId: suite.id,
          scenarioIds: suite.scenarioIds,
          results: scenarioResults.map((result) => ({
            scenarioId: result.scenarioId,
            status: result.status,
            failures: result.failures,
          })),
        },
      },
    };
  }

  async runScenario(scenarioId: AiEmployeeIntegrationScenarioId) {
    return runAiEmployeeIntegrationScenario(scenarioId);
  }
}
