export type AiEmployeeRuntimePresence = "online" | "offline" | "busy" | "idle" | "waiting";

export type AiEmployeeRuntimeStatusSnapshot = {
  presence: AiEmployeeRuntimePresence;
  lastHeartbeat: string | null;
  currentExecutionId: string | null;
  currentExecutionLabel: string | null;
  queueLength: number;
  isPaused: boolean;
};

export type AiEmployeeExecutionQueueCounts = {
  pending: number;
  running: number;
  completed: number;
  failed: number;
};

export type AiEmployeeRunningExecution = {
  id: string;
  workflowLabel: string;
  startedAt: string;
  durationMs: number | null;
  status: string;
};

export type AiEmployeeToolExecutionLogEntry = {
  id: string;
  toolKey: string;
  durationMs: number | null;
  status: string;
  retryCount: number;
  errorMessage: string | null;
  startedAt: string;
};

export type AiEmployeeKnowledgeUsageSnapshot = {
  retrievalCount: number;
  documentsUsed: number;
  averageConfidence: number | null;
  averageDurationMs: number | null;
  successRate: number;
};

export type AiEmployeeRuntimeMetricsSnapshot = {
  executionsToday: number;
  successRate: number;
  averageRuntimeMs: number | null;
  averageQueueTimeMs: number | null;
  retryCount: number;
  timeoutCount: number;
};

export type AiEmployeeOperationsErrorEntry = {
  id: string;
  category: string;
  message: string;
  timestamp: string;
  correlationId: string | null;
};

export type AiEmployeeCostAnalyticsSnapshot = {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  estimatedDailyCost: number;
  estimatedMonthlyCost: number;
  currency: string;
};

export type AiEmployeeLiveEventEntry = {
  id: string;
  eventType: string;
  label: string;
  timestamp: string;
  metadata: Record<string, unknown>;
};

export type AiEmployeeOperationsSnapshot = {
  runtimeStatus: AiEmployeeRuntimeStatusSnapshot;
  queue: AiEmployeeExecutionQueueCounts;
  runningExecutions: AiEmployeeRunningExecution[];
  toolLogs: AiEmployeeToolExecutionLogEntry[];
  knowledgeUsage: AiEmployeeKnowledgeUsageSnapshot;
  metrics: AiEmployeeRuntimeMetricsSnapshot;
  errors: AiEmployeeOperationsErrorEntry[];
  costs: AiEmployeeCostAnalyticsSnapshot;
  timeline: AiEmployeeLiveEventEntry[];
};

export type AiEmployeeOperationsControlAction = "pause" | "resume" | "disable" | "restart";
