import type { ValidationIssue } from "../../core/types";

export type SimulationSessionStatus =
  | "idle"
  | "running"
  | "paused"
  | "waiting_input"
  | "completed"
  | "stopped"
  | "failed";

export type SimulationLogEventType =
  | "session_started"
  | "session_paused"
  | "session_resumed"
  | "session_stopped"
  | "session_restarted"
  | "session_completed"
  | "node_entered"
  | "node_exited"
  | "variable_changed"
  | "branch_selected"
  | "decision_taken"
  | "breakpoint_hit";

export type SimulationNodePathStatus = "executed" | "skipped" | "current" | "pending" | "breakpoint";

export type SimulationVariableScope = "workflow" | "session" | "node";

export type SimulationVariableMutation = {
  key: string;
  scope: SimulationVariableScope;
  previousValue: unknown;
  currentValue: unknown;
  nodeId: string | null;
  timestamp: string;
};

export type SimulationTimelineEntry = {
  id: string;
  timestamp: string;
  type: SimulationLogEventType;
  nodeId: string | null;
  label: string;
  detail?: string;
};

export type SimulationError = {
  id: string;
  severity: "error" | "warning";
  category: "validation" | "variable" | "branch" | "node" | "dead_node";
  message: string;
  nodeId?: string;
};

export type SimulationReport = {
  durationMs: number;
  executedNodeCount: number;
  skippedNodeCount: number;
  pendingNodeCount: number;
  warningCount: number;
  errorCount: number;
  coveragePercent: number;
  readinessScore: number;
  executedNodeIds: string[];
  skippedNodeIds: string[];
  warnings: string[];
  errors: string[];
  exportPayload: Record<string, unknown>;
};

export type SimulationStartOptions = {
  initialVariables?: Record<string, unknown>;
  breakpoints?: string[];
  autoAdvance?: boolean;
  cooperative?: boolean;
  onProgress?: (snapshot: Readonly<SimulationSnapshot>) => void;
};

export type SimulationResumeOptions = {
  simulatedInput?: Record<string, unknown>;
  cooperative?: boolean;
  onProgress?: (snapshot: Readonly<SimulationSnapshot>) => void;
};

export type SimulationSnapshot = {
  sessionId: string | null;
  companyId: string | null;
  flowId: string | null;
  status: SimulationSessionStatus;
  currentNodeId: string | null;
  variables: Record<string, unknown>;
  variableMutations: SimulationVariableMutation[];
  pathExplorer: Array<{
    nodeId: string;
    nodeType: string;
    label: string;
    status: SimulationNodePathStatus;
  }>;
  timeline: SimulationTimelineEntry[];
  logs: SimulationTimelineEntry[];
  validationIssues: ValidationIssue[];
  simulationErrors: SimulationError[];
  stateInspector: {
    currentNode: { id: string; type: string; label: string } | null;
    workflowState: SimulationSessionStatus;
    executionContext: Record<string, unknown>;
    outputs: Record<string, unknown>;
  };
  report: SimulationReport | null;
  breakpoints: string[];
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
};

