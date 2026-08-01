import type { SimulationTimelineEntry } from "../../simulation/types/simulation-types";
import { mapSimulationTimelineToViewModels } from "../../simulation/selectors/simulation-timeline-selectors";
import type { SimulationSnapshot } from "../../simulation/types/simulation-types";
import type { SimulationVariableMutation, SimulationVariableScope } from "../../simulation/types/simulation-types";
import type {
  DebugFrame,
  DebugSelectionState,
  DebuggerInspectorState,
  DebuggerReplayState,
  ReplayFrameSummary,
} from "../types/debugger-types";
import {
  computeDebuggerListWindow,
  DEBUGGER_CALL_STACK_ROW_HEIGHT,
  DEBUGGER_TIMELINE_ROW_HEIGHT,
  DEBUGGER_VARIABLE_ROW_HEIGHT,
  type DebuggerListWindow,
} from "../utilities/debugger-list-window";
import type { SimulationTimelineCardViewModel } from "../../simulation/selectors/simulation-timeline-selectors";

export type DebuggerTimelineCardViewModel = SimulationTimelineCardViewModel & {
  highlight: DebuggerTimelineHighlight;
};

export type DebuggerTimelineViewModel = {
  companyId: string;
  flowId: string;
  cards: DebuggerTimelineCardViewModel[];
  listWindow: DebuggerListWindow;
  rowHeight: number;
};

export type DebuggerPanelViewModel = {
  workflowStatus: SimulationSnapshot["status"];
  execution: ExecutionInspectorViewModel;
  variables: VariableWatchEntryViewModel[];
  variableListWindow: DebuggerListWindow;
  variableRowHeight: number;
  runtime: RuntimeInspectorViewModel;
  callStack: CallStackFrameViewModel[];
  callStackListWindow: DebuggerListWindow;
  callStackRowHeight: number;
  timeline: DebuggerTimelineViewModel;
  selectedVariableKey: string | null;
};

export type ExecutionInspectorViewModel = {
  currentNodeId: string | null;
  currentNodeLabel: string | null;
  currentNodeType: string | null;
  previousNodeId: string | null;
  previousNodeLabel: string | null;
  nextNodeId: string | null;
  nextNodeLabel: string | null;
  workflowState: SimulationSnapshot["status"];
};

export type VariableWatchEntryViewModel = {
  key: string;
  value: string;
  previousValue: string | null;
  scope: SimulationVariableScope;
  type: string;
  changed: boolean;
};

export type RuntimeInspectorViewModel = {
  workflowState: SimulationSnapshot["status"];
  executionContext: Record<string, unknown>;
  outputs: Record<string, unknown>;
  waitingFor: string | null;
  pendingActions: string[];
  frameId: string | null;
  timestamp: string | null;
  stepNumber: number | null;
  branchDepth: number | null;
  executionDepth: number | null;
  parentFrameId: string | null;
};

export type CallStackFrameViewModel = {
  frameIndex: number;
  frameId: string;
  parentFrameId: string | null;
  branchDepth: number;
  executionDepth: number;
  stepNumber: number;
  currentNodeId: string | null;
  currentNodeLabel: string | null;
  status: SimulationSnapshot["status"];
  isReplayPosition: boolean;
  isSelected: boolean;
};

export type DebuggerTimelineHighlight = {
  eventId: string;
  isSelected: boolean;
  isReplayPosition: boolean;
  isWarning: boolean;
  isError: boolean;
};

function readNodeLabel(snapshot: Readonly<SimulationSnapshot>, nodeId: string | null): string | null {
  if (!nodeId) return null;
  const pathEntry = snapshot.pathExplorer.find((entry) => entry.nodeId === nodeId);
  if (pathEntry) return pathEntry.label;
  if (snapshot.stateInspector.currentNode?.id === nodeId) {
    return snapshot.stateInspector.currentNode.label;
  }
  return nodeId;
}

function readNodeType(snapshot: Readonly<SimulationSnapshot>, nodeId: string | null): string | null {
  if (!nodeId) return null;
  const pathEntry = snapshot.pathExplorer.find((entry) => entry.nodeId === nodeId);
  return pathEntry?.nodeType ?? snapshot.stateInspector.currentNode?.type ?? null;
}

function formatDisplayValue(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function readValueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function buildMutationIndex(mutations: ReadonlyArray<SimulationVariableMutation>) {
  const latest = new Map<string, SimulationVariableMutation>();
  for (const mutation of mutations) {
    latest.set(mutation.key, mutation);
  }
  return latest;
}

export function buildExecutionInspectorViewModel(input: {
  snapshot: Readonly<SimulationSnapshot>;
  inspector: DebuggerInspectorState;
}): ExecutionInspectorViewModel {
  const { snapshot, inspector } = input;

  return {
    currentNodeId: inspector.currentNodeId,
    currentNodeLabel: readNodeLabel(snapshot, inspector.currentNodeId),
    currentNodeType: readNodeType(snapshot, inspector.currentNodeId),
    previousNodeId: inspector.previousNodeId,
    previousNodeLabel: readNodeLabel(snapshot, inspector.previousNodeId),
    nextNodeId: inspector.nextNodeId,
    nextNodeLabel: readNodeLabel(snapshot, inspector.nextNodeId),
    workflowState: inspector.workflowState,
  };
}

export function buildVariableWatchViewModel(input: {
  snapshot: Readonly<SimulationSnapshot>;
  selectedVariableKey?: string | null;
}): VariableWatchEntryViewModel[] {
  const mutationIndex = buildMutationIndex(input.snapshot.variableMutations);

  return Object.entries(input.snapshot.variables)
    .filter(([key]) => !key.startsWith("__"))
    .map(([key, value]) => {
      const mutation = mutationIndex.get(key);
      return {
        key,
        value: formatDisplayValue(value),
        previousValue: mutation ? formatDisplayValue(mutation.previousValue) : null,
        scope: mutation?.scope ?? "workflow",
        type: readValueType(value),
        changed: Boolean(mutation),
      };
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}

export function buildRuntimeInspectorViewModel(input: {
  snapshot: Readonly<SimulationSnapshot>;
  frame?: {
    frameId?: string | null;
    timestamp?: string | null;
    stepNumber?: number | null;
    branchDepth?: number | null;
    executionDepth?: number | null;
    parentFrameId?: string | null;
  } | null;
}): RuntimeInspectorViewModel {
  const waitingFor = input.snapshot.stateInspector.executionContext.waitingFor;
  const pendingActions: string[] = [];

  if (waitingFor) {
    pendingActions.push(`waiting:${String(waitingFor)}`);
  }
  if (input.snapshot.status === "paused") {
    pendingActions.push("simulation:paused");
  }
  if (input.snapshot.status === "waiting_input") {
    pendingActions.push("simulation:waiting_input");
  }

  return {
    workflowState: input.snapshot.status,
    executionContext: { ...input.snapshot.stateInspector.executionContext },
    outputs: { ...input.snapshot.stateInspector.outputs },
    waitingFor: typeof waitingFor === "string" ? waitingFor : null,
    pendingActions,
    frameId: input.frame?.frameId ?? null,
    timestamp: input.frame?.timestamp ?? null,
    stepNumber: input.frame?.stepNumber ?? null,
    branchDepth: input.frame?.branchDepth ?? null,
    executionDepth: input.frame?.executionDepth ?? null,
    parentFrameId: input.frame?.parentFrameId ?? null,
  };
}

export function buildCallStackViewModel(input: {
  frames: ReadonlyArray<ReplayFrameSummary | Readonly<DebugFrame>>;
  replay: DebuggerReplayState;
  selectedFrameId?: string | null;
}): CallStackFrameViewModel[] {
  return input.frames.map((frame, frameIndex) => {
    const summary = "snapshot" in frame ? null : frame;
    const debugFrame = "snapshot" in frame ? frame : null;
    const snapshot = debugFrame?.snapshot ?? null;

    const frameId = summary?.frameId ?? debugFrame?.frameId ?? `${frameIndex}`;
    const currentNodeId = summary?.currentNodeId ?? snapshot?.currentNodeId ?? null;

    return {
      frameIndex,
      frameId,
      parentFrameId: summary?.parentFrameId ?? debugFrame?.parentFrameId ?? null,
      branchDepth: summary?.branchDepth ?? debugFrame?.branchDepth ?? 0,
      executionDepth: summary?.executionDepth ?? debugFrame?.executionDepth ?? 0,
      stepNumber: summary?.stepNumber ?? debugFrame?.stepNumber ?? 0,
      currentNodeId,
      currentNodeLabel: summary?.currentNodeLabel ?? readNodeLabel(snapshot ?? createEmptySnapshot(), currentNodeId),
      status: summary?.status ?? snapshot?.status ?? "idle",
      isReplayPosition: input.replay.index === frameIndex,
      isSelected: input.selectedFrameId === frameId,
    };
  });
}

export function buildDebuggerTimelineHighlights(input: {
  snapshot: Readonly<SimulationSnapshot>;
  selectedTimelineEventId?: string | null;
  replayFrameIndex?: number | null;
}): DebuggerTimelineHighlight[] {
  const warningNodeIds = new Set<string>();
  const errorNodeIds = new Set<string>();

  for (const issue of input.snapshot.validationIssues) {
    if (!issue.nodeId) continue;
    if (issue.severity === "warning") warningNodeIds.add(issue.nodeId);
    if (issue.severity === "error") errorNodeIds.add(issue.nodeId);
  }

  for (const issue of input.snapshot.simulationErrors) {
    if (!issue.nodeId) continue;
    if (issue.severity === "warning") warningNodeIds.add(issue.nodeId);
    if (issue.severity === "error") errorNodeIds.add(issue.nodeId);
  }

  return input.snapshot.timeline.map((entry) => ({
    eventId: entry.id,
    isSelected: input.selectedTimelineEventId === entry.id,
    isReplayPosition:
      input.replayFrameIndex != null &&
      input.replayFrameIndex >= 0 &&
      entry.id === resolveReplayHighlightEventId(input.snapshot, input.replayFrameIndex),
    isWarning: entry.nodeId ? warningNodeIds.has(entry.nodeId) : false,
    isError: entry.nodeId ? errorNodeIds.has(entry.nodeId) : false,
  }));
}

function resolveReplayHighlightEventId(snapshot: Readonly<SimulationSnapshot>, _frameIndex: number): string | null {
  for (let index = snapshot.timeline.length - 1; index >= 0; index -= 1) {
    const entry = snapshot.timeline[index];
    if (entry?.type === "node_entered") return entry.id;
  }
  return snapshot.timeline.at(-1)?.id ?? null;
}

export function buildDebuggerTimelineViewModel(input: {
  snapshot: Readonly<SimulationSnapshot>;
  companyId: string;
  flowId: string;
  selectedTimelineEventId?: string | null;
  replayFrameIndex?: number | null;
}): DebuggerTimelineViewModel {
  const highlights = buildDebuggerTimelineHighlights(input);
  const highlightById = new Map(highlights.map((entry) => [entry.eventId, entry]));
  const cards = mapSimulationTimelineToViewModels(input.snapshot.timeline as SimulationTimelineEntry[], {
    companyId: input.companyId,
    flowId: input.flowId,
  }).map((card) => ({
    ...card,
    highlight: highlightById.get(card.id) ?? {
      eventId: card.id,
      isSelected: false,
      isReplayPosition: false,
      isWarning: false,
      isError: false,
    },
  }));

  return {
    companyId: input.companyId,
    flowId: input.flowId,
    cards,
    rowHeight: DEBUGGER_TIMELINE_ROW_HEIGHT,
    listWindow: computeDebuggerListWindow({
      count: cards.length,
      rowHeight: DEBUGGER_TIMELINE_ROW_HEIGHT,
    }),
  };
}

function resolveActiveFrameSummary(input: {
  frames: ReadonlyArray<ReplayFrameSummary>;
  selection: DebugSelectionState;
  replay: DebuggerReplayState;
}): ReplayFrameSummary | null {
  if (input.selection.selectedFrame) {
    return input.frames.find((frame) => frame.frameId === input.selection.selectedFrame?.frameId) ?? null;
  }
  if (input.replay.index >= 0) {
    return input.frames[input.replay.index] ?? null;
  }
  return null;
}

export function buildDebuggerPanelViewModel(input: {
  displayedSnapshot: Readonly<SimulationSnapshot>;
  inspector: DebuggerInspectorState;
  selection: DebugSelectionState;
  replay: DebuggerReplayState;
  frames: ReadonlyArray<ReplayFrameSummary>;
}): DebuggerPanelViewModel {
  const activeFrame = resolveActiveFrameSummary(input);
  const variables = buildVariableWatchViewModel({
    snapshot: input.displayedSnapshot,
    selectedVariableKey: input.selection.selectedVariable,
  });
  const callStack = buildCallStackViewModel({
    frames: input.frames,
    replay: input.replay,
    selectedFrameId: input.selection.selectedFrame?.frameId ?? null,
  });

  return {
    workflowStatus: input.displayedSnapshot.status,
    execution: buildExecutionInspectorViewModel({
      snapshot: input.displayedSnapshot,
      inspector: input.inspector,
    }),
    variables,
    variableRowHeight: DEBUGGER_VARIABLE_ROW_HEIGHT,
    variableListWindow: computeDebuggerListWindow({
      count: variables.length,
      rowHeight: DEBUGGER_VARIABLE_ROW_HEIGHT,
    }),
    runtime: buildRuntimeInspectorViewModel({
      snapshot: input.displayedSnapshot,
      frame: activeFrame,
    }),
    callStack,
    callStackRowHeight: DEBUGGER_CALL_STACK_ROW_HEIGHT,
    callStackListWindow: computeDebuggerListWindow({
      count: callStack.length,
      rowHeight: DEBUGGER_CALL_STACK_ROW_HEIGHT,
    }),
    timeline: buildDebuggerTimelineViewModel({
      snapshot: input.displayedSnapshot,
      companyId: input.displayedSnapshot.companyId ?? "",
      flowId: input.displayedSnapshot.flowId ?? "",
      selectedTimelineEventId: input.selection.selectedTimelineEvent,
      replayFrameIndex: input.replay.mode === "replay" ? input.replay.index : null,
    }),
    selectedVariableKey: input.selection.selectedVariable,
  };
}

function createEmptySnapshot(): SimulationSnapshot {
  return {
    sessionId: null,
    companyId: null,
    flowId: null,
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
  };
}
