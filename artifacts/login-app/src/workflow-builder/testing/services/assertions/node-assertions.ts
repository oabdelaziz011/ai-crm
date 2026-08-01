import { readSimulationReport } from "./assertion-utils";
import type { AssertionHandler } from "./assertion-registry";

export const executedNodeAssertion: AssertionHandler = {
  kind: "node_executed",
  evaluate(assertion, snapshot) {
    const nodeId = assertion.nodeId ?? "";
    const passed = readSimulationReport(snapshot).executedNodeIds.includes(nodeId);
    return {
      assertionId: assertion.id,
      kind: assertion.kind,
      label: assertion.label,
      passed,
      message: passed ? `Node "${nodeId}" executed.` : `Node "${nodeId}" was not executed.`,
    };
  },
};

export const skippedNodeAssertion: AssertionHandler = {
  kind: "node_skipped",
  evaluate(assertion, snapshot) {
    const nodeId = assertion.nodeId ?? "";
    const passed = readSimulationReport(snapshot).skippedNodeIds.includes(nodeId);
    return {
      assertionId: assertion.id,
      kind: assertion.kind,
      label: assertion.label,
      passed,
      message: passed ? `Node "${nodeId}" skipped.` : `Node "${nodeId}" was not skipped.`,
    };
  },
};
