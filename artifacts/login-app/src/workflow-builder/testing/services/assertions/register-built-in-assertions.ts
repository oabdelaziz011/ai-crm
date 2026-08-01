import { equalsAssertion, existsAssertion } from "./equals-assertion";
import { executedNodeAssertion, skippedNodeAssertion } from "./node-assertions";
import { createAssertionRegistry } from "./assertion-registry";
import { branchAssertion, errorAssertion, scoreAssertion, warningAssertion } from "./report-assertions";

export const defaultAssertionRegistry = createAssertionRegistry([
  equalsAssertion,
  existsAssertion,
  executedNodeAssertion,
  skippedNodeAssertion,
  branchAssertion,
  warningAssertion,
  errorAssertion,
  scoreAssertion,
]);

export function createDefaultAssertionRegistry() {
  return defaultAssertionRegistry;
}
