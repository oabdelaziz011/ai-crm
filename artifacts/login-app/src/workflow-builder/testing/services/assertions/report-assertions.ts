import type { AssertionHandler } from "./assertion-registry";
import { findBranchSelection, readSimulationReport } from "./assertion-utils";

export const branchAssertion: AssertionHandler = {
  kind: "branch_selected",
  evaluate(assertion, snapshot) {
    const nodeId = assertion.nodeId ?? "";
    const passed = findBranchSelection(snapshot, nodeId, assertion.branchKey);
    return {
      assertionId: assertion.id,
      kind: assertion.kind,
      label: assertion.label,
      passed,
      message: passed
        ? `Branch "${assertion.branchKey ?? "default"}" selected on node "${nodeId}".`
        : `Branch "${assertion.branchKey ?? "default"}" was not selected on node "${nodeId}".`,
    };
  },
};

export const warningAssertion: AssertionHandler = {
  kind: "warning_exists",
  evaluate(assertion, snapshot) {
    const needle = assertion.message ?? assertion.label;
    const passed = readSimulationReport(snapshot).warnings.some((warning) => warning.includes(needle));
    return {
      assertionId: assertion.id,
      kind: assertion.kind,
      label: assertion.label,
      passed,
      message: passed ? `Warning containing "${needle}" exists.` : `Warning containing "${needle}" not found.`,
    };
  },
};

export const errorAssertion: AssertionHandler = {
  kind: "error_exists",
  evaluate(assertion, snapshot) {
    const needle = assertion.message ?? assertion.label;
    const passed = readSimulationReport(snapshot).errors.some((error) => error.includes(needle));
    return {
      assertionId: assertion.id,
      kind: assertion.kind,
      label: assertion.label,
      passed,
      message: passed ? `Error containing "${needle}" exists.` : `Error containing "${needle}" not found.`,
    };
  },
};

export const scoreAssertion: AssertionHandler = {
  kind: "report_score",
  evaluate(assertion, snapshot) {
    const minScore = assertion.minScore ?? 0;
    const actual = readSimulationReport(snapshot).readinessScore;
    const passed = actual >= minScore;
    return {
      assertionId: assertion.id,
      kind: assertion.kind,
      label: assertion.label,
      passed,
      message: passed
        ? `Readiness score ${actual} meets minimum ${minScore}.`
        : `Readiness score ${actual} is below minimum ${minScore}.`,
    };
  },
};
