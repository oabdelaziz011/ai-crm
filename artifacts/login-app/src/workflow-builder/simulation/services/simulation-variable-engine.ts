import { listAllWorkflowVariables } from "../../core/variables/variable-provider-registry";
import type { SimulationVariableMutation, SimulationVariableScope } from "../types/simulation-types";

export function createInitialSimulationVariables(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const variables: Record<string, unknown> = {};

  for (const variable of listAllWorkflowVariables()) {
    const key = variable.token.replace(/^\{\{|\}\}$/g, "").trim();
    if (!key) continue;
    variables[key] = overrides[key] ?? overrides[variable.token] ?? variable.previewValue ?? null;
  }

  return { ...variables, ...overrides };
}

export function applyVariablePatch(input: {
  current: Record<string, unknown>;
  patch?: Record<string, unknown>;
  nodeId: string | null;
  scope?: SimulationVariableScope;
  timestamp: string;
}): { variables: Record<string, unknown>; mutations: SimulationVariableMutation[] } {
  if (!input.patch) {
    return { variables: { ...input.current }, mutations: [] };
  }

  const next = { ...input.current };
  const mutations: SimulationVariableMutation[] = [];

  for (const [key, currentValue] of Object.entries(input.patch)) {
    const previousValue = input.current[key];
    if (Object.is(previousValue, currentValue)) continue;
    next[key] = currentValue;
    mutations.push({
      key,
      scope: input.scope ?? "workflow",
      previousValue,
      currentValue,
      nodeId: input.nodeId,
      timestamp: input.timestamp,
    });
  }

  return { variables: next, mutations };
}
