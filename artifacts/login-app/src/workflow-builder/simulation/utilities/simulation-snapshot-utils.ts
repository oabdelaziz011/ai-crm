import type { SimulationSnapshot } from "../types/simulation-types";

function deepFreeze<T>(value: T): Readonly<T> {
  if (value === null || typeof value !== "object") {
    return value as Readonly<T>;
  }

  const target = value as Record<string, unknown> | unknown[];
  Object.freeze(target);

  if (Array.isArray(target)) {
    for (const item of target) {
      deepFreeze(item);
    }
    return target as unknown as Readonly<T>;
  }

  for (const key of Object.keys(target)) {
    deepFreeze(target[key]);
  }

  return target as Readonly<T>;
}

export function createIdleSimulationSnapshot(
  companyId: string | null = null,
  flowId: string | null = null,
): Readonly<SimulationSnapshot> {
  return freezeSimulationSnapshot({
    sessionId: null,
    companyId,
    flowId,
    status: "idle",
    currentNodeId: null,
    variables: {},
    variableMutations: [],
    pathExplorer: [],
    timeline: [],
    logs: [],
    validationIssues: [],
    simulationErrors: [],
    stateInspector: {
      currentNode: null,
      workflowState: "idle",
      executionContext: {},
      outputs: {},
    },
    report: null,
    breakpoints: [],
    startedAt: null,
    finishedAt: null,
    durationMs: null,
  });
}

export function freezeSimulationSnapshot(snapshot: SimulationSnapshot): Readonly<SimulationSnapshot> {
  return deepFreeze(structuredClone(snapshot)) as Readonly<SimulationSnapshot>;
}
