import type { TriggerAnalyticsModel } from "../../triggers/types/trigger-types";
import type { WorkflowDocument } from "../../core/types";
import type { WorkflowTriggerAnalyticsView } from "../types/analytics-types";

export function analyzeTriggerUsage(
  document: WorkflowDocument,
  triggerAnalytics: TriggerAnalyticsModel | null,
): WorkflowTriggerAnalyticsView {
  const executions = triggerAnalytics?.executions ?? 0;
  const failures = triggerAnalytics?.failures ?? 0;
  const successes = Math.max(executions - failures, 0);

  return {
    triggerType: document.triggerType,
    executions,
    failures,
    successRate: executions > 0 ? Math.round((successes / executions) * 100) : null,
    averageLatencyMs: triggerAnalytics?.averageLatencyMs ?? null,
  };
}
