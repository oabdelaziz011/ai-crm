import type { SimulationSnapshot } from "../../simulation/types/simulation-types";

export type DebuggerBreakpointKind = "node" | "variable_equals" | "expression" | "execution_count";

export type DebuggerBreakpoint = {
  id: string;
  kind: DebuggerBreakpointKind;
  enabled: boolean;
  label: string;
  nodeId?: string | null;
  variableKey?: string | null;
  expectedValue?: unknown;
  expression?: string | null;
  executionCount?: number | null;
  hitCount: number;
};

export type DebuggerBreakpointHit = {
  breakpointId: string;
  frameIndex: number;
  nodeId: string | null;
  timestamp: string;
  reason: string;
};

export type DebuggerWatchExpression = {
  id: string;
  expression: string;
  enabled: boolean;
  label: string | null;
};

export type DebuggerWatchEvaluation = {
  watchId: string;
  expression: string;
  label: string | null;
  enabled: boolean;
  displayValue: string;
  error: string | null;
};

export type DebuggerExpressionEvaluation = {
  expression: string;
  displayValue: string;
  error: string | null;
};

export type NodeProfilerEntry = {
  nodeId: string;
  label: string;
  executionCount: number;
  averageDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  totalDurationMs: number;
};

export type PerformanceTimelineHighlight = {
  eventId: string;
  nodeId: string | null;
  label: string;
  kind: "slow" | "repeated" | "waiting";
  durationMs: number | null;
};

export type HotPathSummary = {
  pathId: string;
  nodeIds: string[];
  labels: string[];
  visitCount: number;
  totalDurationMs: number;
  kind: "most_executed" | "longest" | "slowest";
};

export type ExecutionMetricsViewModel = {
  nodeCount: number;
  branchCount: number;
  replayDurationMs: number;
  memoryEstimateBytes: number;
  variableCount: number;
  frameCount: number;
};

export type DebugReportViewModel = {
  generatedAt: string;
  readinessScore: number;
  warnings: string[];
  errors: string[];
  bottlenecks: string[];
  hotPaths: HotPathSummary[];
  unusedBranches: string[];
  exportPayload: Record<string, unknown>;
};

export type DebuggerAdvancedViewModel = {
  breakpoints: DebuggerBreakpoint[];
  breakpointHits: DebuggerBreakpointHit[];
  watches: DebuggerWatchEvaluation[];
  expressionDraft: string | null;
  expressionResult: DebuggerExpressionEvaluation | null;
  profiler: NodeProfilerEntry[];
  performanceTimeline: PerformanceTimelineHighlight[];
  hotPaths: HotPathSummary[];
  metrics: ExecutionMetricsViewModel;
  report: DebugReportViewModel;
  workflowStatus: SimulationSnapshot["status"];
};
