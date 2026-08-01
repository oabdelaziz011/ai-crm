import { extractExecutedNodeIdsFromSnapshot } from "../../core/graph/execution-path";
import type { SimulationSnapshot } from "../../simulation/types/simulation-types";
import type { TestAssertion, TestAssertionResult } from "../types/testing-types";
import type { AssertionRegistry } from "./assertions/assertion-registry";
import { createDefaultAssertionRegistry } from "./assertions/register-built-in-assertions";
import { readSimulationReport, stableSerialize, valuesEqual } from "./assertions/assertion-utils";

export class AssertionEngine {
  constructor(private readonly registry: AssertionRegistry = createDefaultAssertionRegistry()) {}

  evaluateAssertions(
    assertions: readonly TestAssertion[],
    snapshot: Readonly<SimulationSnapshot>,
  ): TestAssertionResult[] {
    return assertions.map((assertion) => this.registry.evaluate(assertion, snapshot));
  }

  evaluateExpectedPath(
    expectedPath: readonly string[],
    snapshot: Readonly<SimulationSnapshot>,
  ): TestAssertionResult {
    const actualPath = extractExecutedNodeIdsFromSnapshot(snapshot);
    const passed =
      expectedPath.length === 0 ||
      (expectedPath.length <= actualPath.length &&
        expectedPath.every((nodeId, index) => actualPath[index] === nodeId));

    return {
      assertionId: "__expected_path__",
      kind: "node_executed",
      label: "Expected execution path",
      passed,
      message: passed
        ? "Execution path matches expectation."
        : `Expected path [${expectedPath.join(" → ")}] but got [${actualPath.join(" → ")}].`,
    };
  }

  evaluateExpectedOutputs(
    expectedOutputs: Record<string, unknown>,
    snapshot: Readonly<SimulationSnapshot>,
  ): TestAssertionResult[] {
    return Object.entries(expectedOutputs).map(([key, expectedValue]) => {
      const actual = snapshot.variables[key];
      const passed = valuesEqual(actual, expectedValue);
      return {
        assertionId: `__expected_output__:${key}`,
        kind: "variable_equals",
        label: `Expected output ${key}`,
        passed,
        message: passed
          ? `Output "${key}" matches.`
          : `Output "${key}" expected ${stableSerialize(expectedValue)} but got ${stableSerialize(actual)}.`,
      };
    });
  }

  evaluateExpectedWarnings(
    expectedWarnings: readonly string[],
    snapshot: Readonly<SimulationSnapshot>,
  ): TestAssertionResult[] {
    const warnings = readSimulationReport(snapshot).warnings;
    return expectedWarnings.map((warning, index) => {
      const passed = warnings.some((entry) => entry.includes(warning));
      return {
        assertionId: `__expected_warning__:${index}`,
        kind: "warning_exists",
        label: `Expected warning ${index + 1}`,
        passed,
        message: passed ? `Warning "${warning}" present.` : `Expected warning "${warning}" not found.`,
      };
    });
  }

  evaluateTestCaseAssertions(
    input: {
      assertions: readonly TestAssertion[];
      expectedPath: readonly string[];
      expectedOutputs: Record<string, unknown>;
      expectedWarnings: readonly string[];
    },
    snapshot: Readonly<SimulationSnapshot>,
  ): TestAssertionResult[] {
    return [
      ...this.evaluateAssertions(input.assertions, snapshot),
      this.evaluateExpectedPath(input.expectedPath, snapshot),
      ...this.evaluateExpectedOutputs(input.expectedOutputs, snapshot),
      ...this.evaluateExpectedWarnings(input.expectedWarnings, snapshot),
    ];
  }
}

const defaultEngine = new AssertionEngine();

export function evaluateAssertions(
  assertions: readonly TestAssertion[],
  snapshot: Readonly<SimulationSnapshot>,
): TestAssertionResult[] {
  return defaultEngine.evaluateAssertions(assertions, snapshot);
}

export function evaluateTestCaseAssertions(
  input: {
    assertions: readonly TestAssertion[];
    expectedPath: readonly string[];
    expectedOutputs: Record<string, unknown>;
    expectedWarnings: readonly string[];
  },
  snapshot: Readonly<SimulationSnapshot>,
): TestAssertionResult[] {
  return defaultEngine.evaluateTestCaseAssertions(input, snapshot);
}
