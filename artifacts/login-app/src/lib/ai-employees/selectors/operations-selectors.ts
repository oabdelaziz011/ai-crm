import type { AgentWorkflowEventRecord, AgentWorkflowRecord } from "@workspace/agent-runtime";
import type { AiEmployeeRecord } from "@/lib/ai-employees/types";
import type {
  AiEmployeeCostAnalyticsSnapshot,
  AiEmployeeExecutionQueueCounts,
  AiEmployeeKnowledgeUsageSnapshot,
  AiEmployeeLiveEventEntry,
  AiEmployeeOperationsErrorEntry,
  AiEmployeeOperationsSnapshot,
  AiEmployeeRuntimeMetricsSnapshot,
  AiEmployeeRuntimePresence,
  AiEmployeeRuntimeStatusSnapshot,
  AiEmployeeRunningExecution,
  AiEmployeeToolExecutionLogEntry,
} from "@/lib/ai-employees/types/operations-types";

type RawToolExecution = {
  id: string;
  tool_key: string;
  status: string;
  duration_ms: number | null;
  error_message: string | null;
  started_at: string;
};

type RawRetrievalExecution = {
  id: string;
  execution_status: string;
  execution_time_ms: number | null;
  created_at: string;
  metadata: Record<string, unknown>;
};

type RawUsageRow = {
  id: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number | null;
  status: string;
  recorded_at: string;
  latency_ms: number | null;
  metadata: Record<string, unknown>;
  correlation_id: string | null;
};

type RawBackgroundTask = {
  id: string;
  status: string;
  metadata: Record<string, unknown>;
  started_at: string;
};

const ACTIVE_WORKFLOW_STATUSES = new Set(["running", "waiting_user", "planning", "paused"]);
const COMPLETED_WORKFLOW_STATUSES = new Set(["completed"]);
const FAILED_WORKFLOW_STATUSES = new Set(["failed", "cancelled"]);
const PENDING_WORKFLOW_STATUSES = new Set(["queued", "planning"]);

export function readAiEmployeeIdFromWorkflow(workflow: AgentWorkflowRecord): string | null {
  const pageContext = workflow.memory?.executionState?.pageContext as Record<string, unknown> | undefined;
  const aiEmployeeId = pageContext?.aiEmployeeId;
  return typeof aiEmployeeId === "string" ? aiEmployeeId : null;
}

export function filterWorkflowsForEmployee(
  workflows: AgentWorkflowRecord[],
  employeeId: string,
): AgentWorkflowRecord[] {
  return workflows.filter((workflow) => readAiEmployeeIdFromWorkflow(workflow) === employeeId);
}

export function filterUsageForEmployee(rows: RawUsageRow[], employeeId: string): RawUsageRow[] {
  return rows.filter((row) => {
    const metadataEmployeeId = row.metadata?.aiEmployeeId;
    if (typeof metadataEmployeeId === "string") {
      return metadataEmployeeId === employeeId;
    }
    return false;
  });
}

export function buildRuntimeStatus(
  employee: AiEmployeeRecord,
  workflows: AgentWorkflowRecord[],
  backgroundTasks: RawBackgroundTask[],
): AiEmployeeRuntimeStatusSnapshot {
  const employeeWorkflows = filterWorkflowsForEmployee(workflows, employee.id);
  const running = employeeWorkflows.find((workflow) => workflow.status === "running");
  const waiting = employeeWorkflows.find((workflow) => workflow.status === "waiting_user");
  const activeTask = backgroundTasks.find((task) => task.status === "running" || task.status === "queued");

  let presence: AiEmployeeRuntimePresence = "offline";
  if (employee.status === "disabled") {
    presence = "offline";
  } else if (employee.status !== "published") {
    presence = "offline";
  } else if (waiting) {
    presence = "waiting";
  } else if (running) {
    presence = "busy";
  } else if (employeeWorkflows.some((workflow) => ACTIVE_WORKFLOW_STATUSES.has(workflow.status))) {
    presence = "busy";
  } else {
    presence = "idle";
  }

  const lastActivity = [
    ...employeeWorkflows.map((workflow) => workflow.updated_at),
    ...backgroundTasks.map((task) => task.started_at),
  ]
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0];

  if (employee.status === "published" && lastActivity) {
    const ageMs = Date.now() - new Date(lastActivity).getTime();
    if (ageMs < 5 * 60_000 && presence === "idle") {
      presence = "online";
    }
  }

  const queueLength =
    employeeWorkflows.filter((workflow) => PENDING_WORKFLOW_STATUSES.has(workflow.status)).length +
    backgroundTasks.filter((task) => task.status === "queued").length;

  return {
    presence,
    lastHeartbeat: lastActivity ?? employee.updatedAt,
    currentExecutionId: running?.id ?? waiting?.id ?? activeTask?.id ?? null,
    currentExecutionLabel: running?.goal ?? waiting?.goal ?? activeTask?.metadata?.label?.toString() ?? null,
    queueLength,
    isPaused: employee.status === "disabled",
  };
}

export function buildExecutionQueue(workflows: AgentWorkflowRecord[]): AiEmployeeExecutionQueueCounts {
  return workflows.reduce<AiEmployeeExecutionQueueCounts>(
    (counts, workflow) => {
      if (PENDING_WORKFLOW_STATUSES.has(workflow.status)) counts.pending += 1;
      else if (workflow.status === "running" || workflow.status === "waiting_user") counts.running += 1;
      else if (COMPLETED_WORKFLOW_STATUSES.has(workflow.status)) counts.completed += 1;
      else if (FAILED_WORKFLOW_STATUSES.has(workflow.status)) counts.failed += 1;
      return counts;
    },
    { pending: 0, running: 0, completed: 0, failed: 0 },
  );
}

export function mapRunningExecutions(workflows: AgentWorkflowRecord[]): AiEmployeeRunningExecution[] {
  return workflows
    .filter((workflow) => workflow.status === "running" || workflow.status === "waiting_user")
    .map((workflow) => ({
      id: workflow.id,
      workflowLabel: workflow.goal,
      startedAt: workflow.created_at,
      durationMs: workflow.completed_at
        ? new Date(workflow.completed_at).getTime() - new Date(workflow.created_at).getTime()
        : Date.now() - new Date(workflow.created_at).getTime(),
      status: workflow.status,
    }));
}

export function mapToolLogs(
  rows: RawToolExecution[],
  allowedToolKeys: string[],
): AiEmployeeToolExecutionLogEntry[] {
  const allowed = new Set(allowedToolKeys);
  return rows
    .filter((row) => allowed.size === 0 || allowed.has(row.tool_key))
    .slice(0, 50)
    .map((row) => ({
      id: row.id,
      toolKey: row.tool_key,
      durationMs: row.duration_ms,
      status: row.status,
      retryCount: 0,
      errorMessage: row.error_message,
      startedAt: row.started_at,
    }));
}

export function buildKnowledgeUsage(rows: RawRetrievalExecution[]): AiEmployeeKnowledgeUsageSnapshot {
  if (rows.length === 0) {
    return {
      retrievalCount: 0,
      documentsUsed: 0,
      averageConfidence: null,
      averageDurationMs: null,
      successRate: 0,
    };
  }

  const succeeded = rows.filter((row) => row.execution_status === "completed" || row.execution_status === "succeeded");
  const durations = rows
    .map((row) => row.execution_time_ms)
    .filter((value): value is number => typeof value === "number");
  const confidences = rows
    .map((row) => row.metadata?.averageScore)
    .filter((value): value is number => typeof value === "number");

  const documentsUsed = rows.reduce((total, row) => {
    const count = row.metadata?.documentsUsed;
    return total + (typeof count === "number" ? count : 0);
  }, 0);

  return {
    retrievalCount: rows.length,
    documentsUsed,
    averageConfidence:
      confidences.length > 0 ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : null,
    averageDurationMs:
      durations.length > 0 ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
    successRate: Math.round((succeeded.length / rows.length) * 100),
  };
}

export function buildRuntimeMetrics(
  workflows: AgentWorkflowRecord[],
  usageRows: RawUsageRow[],
): AiEmployeeRuntimeMetricsSnapshot {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayWorkflows = workflows.filter((workflow) => workflow.created_at >= todayStart.toISOString());
  const todayUsage = usageRows.filter((row) => row.recorded_at >= todayStart.toISOString());
  const succeeded = todayWorkflows.filter((workflow) => workflow.status === "completed");
  const failed = todayWorkflows.filter((workflow) => FAILED_WORKFLOW_STATUSES.has(workflow.status));
  const durations = todayWorkflows
    .filter((workflow) => workflow.completed_at)
    .map((workflow) => new Date(workflow.completed_at!).getTime() - new Date(workflow.created_at).getTime());

  const latencies = todayUsage
    .map((row) => row.latency_ms)
    .filter((value): value is number => typeof value === "number");

  return {
    executionsToday: todayWorkflows.length + todayUsage.length,
    successRate:
      todayWorkflows.length > 0 ? Math.round((succeeded.length / todayWorkflows.length) * 100) : todayUsage.length > 0 ? 100 : 0,
    averageRuntimeMs:
      durations.length > 0 ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
    averageQueueTimeMs:
      latencies.length > 0 ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null,
    retryCount: todayWorkflows.reduce((total, workflow) => {
      return total + workflow.task_graph.nodes.reduce((nodeTotal, node) => nodeTotal + node.retryCount, 0);
    }, 0),
    timeoutCount: todayUsage.filter((row) => row.status === "timeout").length + failed.length,
  };
}

export function buildErrorCenter(
  workflows: AgentWorkflowRecord[],
  toolRows: RawToolExecution[],
): AiEmployeeOperationsErrorEntry[] {
  const workflowErrors = workflows
    .filter((workflow) => workflow.error_message)
    .map((workflow) => ({
      id: workflow.id,
      category: "workflow",
      message: workflow.error_message ?? "Workflow failed",
      timestamp: workflow.updated_at,
      correlationId: workflow.correlation_id,
    }));

  const toolErrors = toolRows
    .filter((row) => row.status === "failed" && row.error_message)
    .map((row) => ({
      id: row.id,
      category: "tool",
      message: row.error_message ?? "Tool execution failed",
      timestamp: row.started_at,
      correlationId: null,
    }));

  return [...workflowErrors, ...toolErrors]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 20);
}

export function buildCostAnalytics(rows: RawUsageRow[]): AiEmployeeCostAnalyticsSnapshot {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

  const dailyRows = rows.filter((row) => row.recorded_at >= todayStart.toISOString());
  const monthlyRows = rows.filter((row) => row.recorded_at >= monthStart.toISOString());

  const sumCost = (target: RawUsageRow[]) =>
    target.reduce((total, row) => total + Number(row.estimated_cost_usd ?? 0), 0);

  return {
    requests: rows.length,
    promptTokens: rows.reduce((total, row) => total + row.input_tokens, 0),
    completionTokens: rows.reduce((total, row) => total + row.output_tokens, 0),
    estimatedDailyCost: sumCost(dailyRows),
    estimatedMonthlyCost: sumCost(monthlyRows),
    currency: "USD",
  };
}

export function buildLiveTimeline(
  workflows: AgentWorkflowRecord[],
  events: AgentWorkflowEventRecord[],
): AiEmployeeLiveEventEntry[] {
  const workflowEvents = events.map((event) => ({
    id: event.id,
    eventType: event.event_type,
    label: formatEventLabel(event.event_type, event.payload),
    timestamp: event.created_at,
    metadata: event.payload,
  }));

  const lifecycleEvents = workflows.flatMap((workflow) => {
    const entries: AiEmployeeLiveEventEntry[] = [
      {
        id: `${workflow.id}-started`,
        eventType: "workflow_started",
        label: workflow.goal,
        timestamp: workflow.created_at,
        metadata: { workflowId: workflow.id, status: workflow.status },
      },
    ];
    if (workflow.completed_at) {
      entries.push({
        id: `${workflow.id}-finished`,
        eventType: workflow.status === "completed" ? "workflow_finished" : "execution_failed",
        label: workflow.goal,
        timestamp: workflow.completed_at,
        metadata: { workflowId: workflow.id, status: workflow.status },
      });
    }
    return entries;
  });

  return [...workflowEvents, ...lifecycleEvents]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 50);
}

function formatEventLabel(eventType: string, payload: Record<string, unknown>): string {
  if (eventType === "tool_executed" && typeof payload.tool === "string") {
    return payload.tool;
  }
  if (eventType === "knowledge_retrieved") {
    return "Knowledge retrieval";
  }
  return eventType.replace(/_/g, " ");
}

export function buildOperationsSnapshot(input: {
  employee: AiEmployeeRecord;
  workflows: AgentWorkflowRecord[];
  events: AgentWorkflowEventRecord[];
  toolExecutions: RawToolExecution[];
  retrievalExecutions: RawRetrievalExecution[];
  usageRows: RawUsageRow[];
  backgroundTasks: RawBackgroundTask[];
}): AiEmployeeOperationsSnapshot {
  const employeeWorkflows = filterWorkflowsForEmployee(input.workflows, input.employee.id);
  const employeeUsage = filterUsageForEmployee(input.usageRows, input.employee.id);
  const employeeEvents = input.events.filter((event) =>
    employeeWorkflows.some((workflow) => workflow.id === event.workflow_id),
  );

  return {
    runtimeStatus: buildRuntimeStatus(input.employee, input.workflows, input.backgroundTasks),
    queue: buildExecutionQueue(employeeWorkflows),
    runningExecutions: mapRunningExecutions(employeeWorkflows),
    toolLogs: mapToolLogs(input.toolExecutions, input.employee.allowedToolKeys),
    knowledgeUsage: buildKnowledgeUsage(input.retrievalExecutions),
    metrics: buildRuntimeMetrics(employeeWorkflows, employeeUsage),
    errors: buildErrorCenter(employeeWorkflows, input.toolExecutions),
    costs: buildCostAnalytics(employeeUsage.length > 0 ? employeeUsage : input.usageRows.slice(0, 20)),
    timeline: buildLiveTimeline(employeeWorkflows, employeeEvents),
  };
}
