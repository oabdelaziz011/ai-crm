import type { WorkflowDocument } from "../../core/types";
import type { SimulationSnapshot } from "../../simulation/types/simulation-types";
import type { DebuggerKernel } from "../services/debugger-kernel";
import type { DebuggerKernelScope } from "../types/debugger-kernel-types";
import type { DebuggerAdvancedViewModel } from "../types/debugger-advanced-types";
import type { DebugFrame } from "../types/debugger-types";
import {
  selectBreakpointHits,
  selectLatestExpressionEvaluation,
  selectLatestProfilerUpdate,
  selectLatestWatchEvaluations,
} from "./debugger-event-selectors";
import {
  buildDebugReportViewModel,
  buildExecutionMetrics,
  buildHotPathSummaries,
  buildNodeProfilerFromFrames,
  buildPerformanceTimelineHighlights,
} from "../utilities/debugger-analysis-utils";

export function buildDebuggerAdvancedViewModel(input: {
  kernel: DebuggerKernel;
  scope: DebuggerKernelScope;
  document: WorkflowDocument;
  displayedSnapshot: Readonly<SimulationSnapshot>;
  frames: ReadonlyArray<Readonly<DebugFrame>>;
}): DebuggerAdvancedViewModel {
  const eventStream = input.kernel.getEventStream(input.scope);
  const profilerFromEvents = selectLatestProfilerUpdate(eventStream);
  const profiler = profilerFromEvents.length > 0 ? profilerFromEvents : buildNodeProfilerFromFrames(input.frames);
  const hotPaths = buildHotPathSummaries({
    document: input.document,
    frames: input.frames,
    profiler,
  });

  const watches = selectLatestWatchEvaluations(eventStream);
  const expressionResult = selectLatestExpressionEvaluation(eventStream);
  const breakpointHits = selectBreakpointHits(eventStream);

  return {
    breakpoints: input.kernel.breakpoints.list(input.scope),
    breakpointHits: breakpointHits.length > 0 ? breakpointHits : input.kernel.breakpoints.listHits(input.scope),
    watches,
    expressionDraft: input.kernel.watches.getExpressionDraft(input.scope),
    expressionResult,
    profiler,
    performanceTimeline: buildPerformanceTimelineHighlights({
      snapshot: input.displayedSnapshot,
      profiler,
    }),
    hotPaths,
    metrics: buildExecutionMetrics({
      document: input.document,
      frames: input.frames,
      snapshot: input.displayedSnapshot,
    }),
    report: buildDebugReportViewModel({
      document: input.document,
      snapshot: input.displayedSnapshot,
      frames: input.frames,
      profiler,
      hotPaths,
    }),
    workflowStatus: input.displayedSnapshot.status,
  };
}
