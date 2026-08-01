/**
 * Workflow Builder AI Employee integration tests.
 * Run: pnpm --dir artifacts/login-app test:workflow-builder-ai-employee-integration
 */
import assert from "node:assert/strict";
import {
  AiEmployeeIntegrationTestingService,
  builtInAiEmployeeIntegrationSuites,
} from "../src/workflow-builder/testing/ai-employee";

console.log("\nWorkflow Builder AI Employee integration tests\n");

{
  const suites = builtInAiEmployeeIntegrationSuites();
  assert.ok(suites.length >= 3);
  const enterprise = suites.find((suite) => suite.id === "suite-ai-employee-enterprise");
  assert.ok(enterprise);
  assert.equal(enterprise!.scenarioIds.length, 22);
  console.log("  ✓ built-in AI Employee integration suites registered");
}

{
  const service = new AiEmployeeIntegrationTestingService();
  const run = await service.runSuite("suite-ai-employee-enterprise");
  assert.ok(run);
  assert.equal(run!.scenarioResults.length, 22);

  for (const result of run!.scenarioResults) {
    if (result.status !== "passed") {
      console.error(`  ✗ ${result.scenarioName}`);
      for (const failure of result.failures) {
        console.error(`      ${failure}`);
      }
    }
  }

  assert.equal(run!.failed, 0, `Expected all scenarios to pass, failed=${run!.failed}`);
  assert.ok(run!.report.readinessScore >= 100);
  console.log(`  ✓ enterprise AI Employee integration suite (${run!.passed}/${run!.scenarioResults.length} passed)`);
}

console.log("\nAll AI Employee integration tests passed.\n");
