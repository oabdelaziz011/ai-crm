import type { SimulationSnapshot } from "../../../simulation/types/simulation-types";
import type { TestAssertion, TestAssertionKind, TestAssertionResult } from "../../types/testing-types";

export type AssertionHandler = {
  kind: TestAssertionKind;
  evaluate(assertion: TestAssertion, snapshot: Readonly<SimulationSnapshot>): TestAssertionResult;
};

export type AssertionRegistry = {
  register(handler: AssertionHandler): void;
  evaluate(assertion: TestAssertion, snapshot: Readonly<SimulationSnapshot>): TestAssertionResult;
  has(kind: TestAssertionKind): boolean;
};

export function createAssertionRegistry(handlers: readonly AssertionHandler[] = []): AssertionRegistry {
  const registry = new Map<TestAssertionKind, AssertionHandler>();
  for (const handler of handlers) {
    registry.set(handler.kind, handler);
  }

  return {
    register(handler: AssertionHandler) {
      registry.set(handler.kind, handler);
    },
    has(kind: TestAssertionKind) {
      return registry.has(kind);
    },
    evaluate(assertion, snapshot) {
      const handler = registry.get(assertion.kind);
      if (!handler) {
        return {
          assertionId: assertion.id,
          kind: assertion.kind,
          label: assertion.label,
          passed: false,
          message: "Unsupported assertion kind.",
        };
      }
      return handler.evaluate(assertion, snapshot);
    },
  };
}
