import type { TestAssertion } from "../../types/testing-types";
import type { AssertionHandler } from "./assertion-registry";
import { stableSerialize, valuesEqual } from "./assertion-utils";

export const equalsAssertion: AssertionHandler = {
  kind: "variable_equals",
  evaluate(assertion, snapshot) {
    const key = assertion.variableKey ?? "";
    const actual = snapshot.variables[key];
    const passed = valuesEqual(actual, assertion.expectedValue);
    return {
      assertionId: assertion.id,
      kind: assertion.kind,
      label: assertion.label,
      passed,
      message: passed
        ? `Variable "${key}" equals expected value.`
        : `Variable "${key}" expected ${stableSerialize(assertion.expectedValue)} but got ${stableSerialize(actual)}.`,
    };
  },
};

export const existsAssertion: AssertionHandler = {
  kind: "variable_exists",
  evaluate(assertion, snapshot) {
    const key = assertion.variableKey ?? "";
    const passed = Object.prototype.hasOwnProperty.call(snapshot.variables, key);
    return {
      assertionId: assertion.id,
      kind: assertion.kind,
      label: assertion.label,
      passed,
      message: passed ? `Variable "${key}" exists.` : `Variable "${key}" is missing.`,
    };
  },
};
