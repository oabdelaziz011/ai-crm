import type { AgentWorkflowEventRecord, AgentWorkflowRecord } from "@workspace/agent-runtime";
import type { AiEmployeeRecord } from "@/lib/ai-employees/types";
import type {
  AiEmployeeContextDebuggerSnapshot,
  AiEmployeeContextInspectorSnapshot,
  AiEmployeeContextWindowSnapshot,
  AiEmployeeLongTermMemoryEntry,
  AiEmployeeMemoryAnalyticsSnapshot,
  AiEmployeeMemoryEntryType,
  AiEmployeeMemoryOverview,
  AiEmployeeMemoryPoliciesSnapshot,
  AiEmployeeMemorySearchFilters,
  AiEmployeeMemorySnapshot,
  AiEmployeeMemoryTimelineEntry,
  AiEmployeeShortTermMemory,
} from "@/lib/ai-employees/types/memory-types";
import type {
  MemoryCheckpointRow,
  MemoryConversationMessageRow,
  MemoryRetrievalContextRow,
} from "@/lib/ai-employees/repositories/ai-employee-memory-repository";
import { filterWorkflowsForEmployee } from "@/lib/ai-employees/selectors/operations-selectors";

const APPROX_CHARS_PER_TOKEN = 4;

type RawRetrievalExecution = {
  id: string;
  execution_status: string;
  execution_time_ms: number | null;
  created_at: string;
  metadata: Record<string, unknown>;
};

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

export function buildMemorySnapshot(input: {
  employee: AiEmployeeRecord;
  previewPrompt: string;
  workflows: AgentWorkflowRecord[];
  events: AgentWorkflowEventRecord[];
  checkpoints: MemoryCheckpointRow[];
  retrievalContexts: MemoryRetrievalContextRow[];
  retrievalExecutions: RawRetrievalExecution[];
  messages: MemoryConversationMessageRow[];
}): AiEmployeeMemorySnapshot {
  const employeeWorkflows = filterWorkflowsForEmployee(input.workflows, input.employee.id);
  const latestWorkflow = employeeWorkflows[0] ?? null;
  const memory = latestWorkflow?.memory;

  const shortTerm = buildShortTermMemory(latestWorkflow);
  const longTerm = buildLongTermMemory(employeeWorkflows, input.checkpoints, memory);
  const contextWindow = buildContextWindow(input.employee, input.previewPrompt, shortTerm, longTerm, input.messages, input.retrievalContexts);
  const timeline = buildMemoryTimeline(employeeWorkflows, input.events, input.checkpoints, input.retrievalExecutions);
  const inspector = buildContextInspector(input.employee, input.previewPrompt, shortTerm, longTerm, input.retrievalContexts);
  const policies = buildMemoryPolicies(input.employee);
  const analytics = buildMemoryAnalytics(employeeWorkflows, input.retrievalExecutions, contextWindow);
  const debuggerView = buildContextDebugger(input.previewPrompt, shortTerm, longTerm, input.retrievalContexts, timeline, contextWindow.estimatedTokens);
  const overview = buildMemoryOverview(contextWindow, longTerm, analytics);

  return {
    overview,
    shortTerm,
    longTerm,
    contextWindow,
    timeline,
    inspector,
    policies,
    analytics,
    debugger: debuggerView,
  };
}

export function filterMemoryEntries(
  entries: AiEmployeeLongTermMemoryEntry[],
  filters: AiEmployeeMemorySearchFilters,
): AiEmployeeLongTermMemoryEntry[] {
  const keyword = filters.keyword?.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filters.type && filters.type !== "all" && entry.type !== filters.type) return false;
    if (filters.source && filters.source !== "all" && entry.source !== filters.source) return false;
    if (filters.fromDate && entry.createdAt < filters.fromDate) return false;
    if (filters.toDate && entry.createdAt > filters.toDate) return false;
    if (keyword) {
      const haystack = `${entry.label} ${entry.content} ${entry.source}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

function buildShortTermMemory(latestWorkflow: AgentWorkflowRecord | null): AiEmployeeShortTermMemory {
  const memory = latestWorkflow?.memory;
  const variables = memory?.variables ?? {};
  const executionState = memory?.executionState ?? {};

  const recentFacts: string[] = [];
  for (const taskId of (memory?.completedTaskIds ?? []).slice(-5)) {
    recentFacts.push(`Completed task: ${taskId}`);
  }
  for (const [taskId, output] of Object.entries(memory?.toolOutputs ?? {}).slice(-5)) {
    if (typeof output === "object" && output && "summary" in output) {
      recentFacts.push(String((output as { summary: unknown }).summary));
    } else {
      recentFacts.push(`Tool output from ${taskId}`);
    }
  }

  return {
    sessionId: latestWorkflow?.conversation_id ?? null,
    activeVariables: Object.entries(variables).map(([key, value]) => ({
      key,
      value: stringifyValue(value),
    })),
    recentFacts,
    runtimeContext: executionState,
  };
}

function buildLongTermMemory(
  workflows: AgentWorkflowRecord[],
  checkpoints: MemoryCheckpointRow[],
  activeMemory: AgentWorkflowRecord["memory"] | undefined,
): AiEmployeeLongTermMemoryEntry[] {
  const entries: AiEmployeeLongTermMemoryEntry[] = [];

  for (const [key, value] of Object.entries(activeMemory?.variables ?? {})) {
    entries.push({
      id: `var-${key}`,
      type: "variable",
      label: key,
      content: stringifyValue(value),
      source: "workflow_memory",
      createdAt: workflows[0]?.created_at ?? new Date().toISOString(),
      updatedAt: workflows[0]?.updated_at ?? new Date().toISOString(),
    });
  }

  for (const checkpoint of checkpoints) {
    entries.push({
      id: checkpoint.id,
      type: "checkpoint",
      label: `Checkpoint #${checkpoint.checkpoint_index}`,
      content: JSON.stringify(checkpoint.snapshot).slice(0, 240),
      source: "agent_workflow_checkpoints",
      createdAt: checkpoint.created_at,
      updatedAt: checkpoint.created_at,
    });
  }

  for (const workflow of workflows) {
    for (const [taskId, output] of Object.entries(workflow.memory?.toolOutputs ?? {})) {
      const text = stringifyValue(output);
      if (text.length < 20) continue;
      entries.push({
        id: `${workflow.id}-${taskId}`,
        type: "tool_output",
        label: taskId,
        content: text.slice(0, 500),
        source: "workflow_tool_output",
        createdAt: workflow.created_at,
        updatedAt: workflow.updated_at,
      });
    }
  }

  return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function buildContextWindow(
  employee: AiEmployeeRecord,
  prompt: string,
  shortTerm: AiEmployeeShortTermMemory,
  longTerm: AiEmployeeLongTermMemoryEntry[],
  messages: MemoryConversationMessageRow[],
  retrievalContexts: MemoryRetrievalContextRow[],
): AiEmployeeContextWindowSnapshot {
  const maxTokens = employee.maxTokens ?? 4096;
  const promptTokens = estimateTokens(prompt);
  const variableTokens = estimateTokens(shortTerm.activeVariables.map((item) => item.value).join("\n"));
  const factTokens = estimateTokens(shortTerm.recentFacts.join("\n"));
  const longTermTokens = estimateTokens(longTerm.slice(0, 10).map((entry) => entry.content).join("\n"));
  const conversationTokens = estimateTokens(messages.slice(0, 20).map((message) => message.content).join("\n"));
  const knowledgeTokens = retrievalContexts.reduce((total, context) => total + (context.total_tokens ?? 0), 0);

  const sections = [
    { key: "prompt", label: "System prompt", tokenEstimate: promptTokens, included: Boolean(prompt.trim()) },
    { key: "variables", label: "Active variables", tokenEstimate: variableTokens, included: shortTerm.activeVariables.length > 0 },
    { key: "facts", label: "Recent facts", tokenEstimate: factTokens, included: shortTerm.recentFacts.length > 0 },
    { key: "longTerm", label: "Stored memories", tokenEstimate: longTermTokens, included: longTerm.length > 0 },
    { key: "conversation", label: "Conversation history", tokenEstimate: conversationTokens, included: messages.length > 0 },
    { key: "knowledge", label: "Knowledge references", tokenEstimate: knowledgeTokens, included: retrievalContexts.length > 0 },
  ];

  const estimatedTokens = sections.reduce((total, section) => total + (section.included ? section.tokenEstimate : 0), 0);

  return {
    maxTokens,
    estimatedTokens,
    sections,
    conversationHistoryCount: messages.length,
    knowledgeReferenceCount: retrievalContexts.length,
  };
}

function buildMemoryTimeline(
  workflows: AgentWorkflowRecord[],
  events: AgentWorkflowEventRecord[],
  checkpoints: MemoryCheckpointRow[],
  retrievalExecutions: RawRetrievalExecution[],
): AiEmployeeMemoryTimelineEntry[] {
  const timeline: AiEmployeeMemoryTimelineEntry[] = [];

  for (const checkpoint of checkpoints) {
    timeline.push({
      id: checkpoint.id,
      eventType: "updated",
      label: `Checkpoint saved (#${checkpoint.checkpoint_index})`,
      source: "agent_workflow_checkpoints",
      timestamp: checkpoint.created_at,
    });
  }

  for (const event of events) {
    if (event.event_type === "CheckpointSaved") {
      timeline.push({
        id: event.id,
        eventType: "updated",
        label: "Memory checkpoint saved",
        source: "agent_workflow_events",
        timestamp: event.created_at,
      });
    }
  }

  for (const execution of retrievalExecutions) {
    timeline.push({
      id: execution.id,
      eventType: execution.execution_status === "completed" ? "retrieved" : "expired",
      label: "Knowledge retrieval",
      source: "retrieval_executions",
      timestamp: execution.created_at,
    });
  }

  for (const workflow of workflows) {
    timeline.push({
      id: `${workflow.id}-created`,
      eventType: "created",
      label: workflow.goal,
      source: "agent_workflows",
      timestamp: workflow.created_at,
    });
  }

  return timeline.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 50);
}

function buildContextInspector(
  employee: AiEmployeeRecord,
  prompt: string,
  shortTerm: AiEmployeeShortTermMemory,
  longTerm: AiEmployeeLongTermMemoryEntry[],
  retrievalContexts: MemoryRetrievalContextRow[],
): AiEmployeeContextInspectorSnapshot {
  return {
    prompt,
    memories: longTerm.slice(0, 12).map((entry) => `${entry.label}: ${entry.content}`),
    knowledgeReferences: retrievalContexts.slice(0, 12).map((context) => `Context ${context.id.slice(0, 8)} (${context.chunk_count} chunks)`),
    runtimeVariables: shortTerm.activeVariables,
    toolContext: longTerm.filter((entry) => entry.type === "tool_output").slice(0, 8).map((entry) => entry.content),
  };
}

function buildMemoryPolicies(employee: AiEmployeeRecord): AiEmployeeMemoryPoliciesSnapshot {
  const flags = employee.runtimeConfiguration.runtimeFlags;
  const retrieval = employee.runtimeConfiguration.retrievalPolicy;
  return {
    memoryMode: flags.memoryMode,
    retentionPolicy: flags.memoryMode === "session" ? "Session-scoped" : flags.memoryMode === "workflow" ? "Workflow-scoped" : "Disabled",
    expirationPolicy: flags.checkpointEnabled ? "Checkpoint-based persistence" : "Ephemeral until checkpoint",
    privacyRules: [
      "Tenant-isolated memory reads",
      "RBAC enforced on workflow and conversation access",
      employee.knowledgeSourceIds.length > 0 ? "Knowledge limited to assigned sources" : "No knowledge sources assigned",
    ],
    maxContextSize: employee.maxTokens ?? 4096,
  };
}

function buildMemoryAnalytics(
  workflows: AgentWorkflowRecord[],
  retrievalExecutions: RawRetrievalExecution[],
  contextWindow: AiEmployeeContextWindowSnapshot,
): AiEmployeeMemoryAnalyticsSnapshot {
  const hits = workflows.filter((workflow) => Object.keys(workflow.memory?.toolOutputs ?? {}).length > 0).length;
  const misses = workflows.length - hits;
  const succeeded = retrievalExecutions.filter((row) => row.execution_status === "completed" || row.execution_status === "succeeded");
  const durations = retrievalExecutions
    .map((row) => row.execution_time_ms)
    .filter((value): value is number => typeof value === "number");

  return {
    memoryHits: hits,
    memoryMisses: misses,
    retrievalSuccessRate: retrievalExecutions.length > 0 ? Math.round((succeeded.length / retrievalExecutions.length) * 100) : 0,
    averageRetrievalTimeMs:
      durations.length > 0 ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
    contextGrowthPercent:
      contextWindow.maxTokens > 0 ? Math.round((contextWindow.estimatedTokens / contextWindow.maxTokens) * 100) : 0,
  };
}

function buildContextDebugger(
  prompt: string,
  shortTerm: AiEmployeeShortTermMemory,
  longTerm: AiEmployeeLongTermMemoryEntry[],
  retrievalContexts: MemoryRetrievalContextRow[],
  timeline: AiEmployeeMemoryTimelineEntry[],
  finalTokens: number,
): AiEmployeeContextDebuggerSnapshot {
  const assemblyOrder = [
    { order: 1, source: "prompt", label: "System prompt", tokenEstimate: estimateTokens(prompt) },
    {
      order: 2,
      source: "short_term",
      label: "Short-term variables",
      tokenEstimate: estimateTokens(shortTerm.activeVariables.map((item) => item.value).join("\n")),
    },
    {
      order: 3,
      source: "long_term",
      label: "Long-term memory entries",
      tokenEstimate: estimateTokens(longTerm.slice(0, 10).map((entry) => entry.content).join("\n")),
    },
    {
      order: 4,
      source: "knowledge",
      label: "Knowledge retrieval contexts",
      tokenEstimate: retrievalContexts.reduce((total, context) => total + (context.total_tokens ?? 0), 0),
    },
    {
      order: 5,
      source: "timeline",
      label: "Timeline-derived context hints",
      tokenEstimate: estimateTokens(timeline.slice(0, 5).map((entry) => entry.label).join("\n")),
    },
  ];

  return {
    assemblyOrder,
    memorySources: ["agent_workflows.memory", "agent_workflow_checkpoints"],
    knowledgeSources: ["retrieval_contexts", "retrieval_executions"],
    timelineSources: ["agent_workflow_events", "retrieval_executions"],
    finalContextSizeTokens: finalTokens,
  };
}

function buildMemoryOverview(
  contextWindow: AiEmployeeContextWindowSnapshot,
  longTerm: AiEmployeeLongTermMemoryEntry[],
  analytics: AiEmployeeMemoryAnalyticsSnapshot,
): AiEmployeeMemoryOverview {
  let memoryHealth: AiEmployeeMemoryOverview["memoryHealth"] = "empty";
  if (longTerm.length > 0 || contextWindow.estimatedTokens > 0) {
    memoryHealth = analytics.retrievalSuccessRate >= 70 || analytics.memoryHits > 0 ? "healthy" : "degraded";
  }

  return {
    activeContextLabel: contextWindow.sections.find((section) => section.included)?.label ?? "No active context",
    contextSizeTokens: contextWindow.estimatedTokens,
    storedMemories: longTerm.length,
    memoryHealth,
    memoryUsagePercent: contextWindow.maxTokens > 0 ? Math.round((contextWindow.estimatedTokens / contextWindow.maxTokens) * 100) : 0,
  };
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function listMemorySources(entries: AiEmployeeLongTermMemoryEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.source))].sort();
}

export function listMemoryTypes(): AiEmployeeMemoryEntryType[] {
  return ["variable", "fact", "preference", "tool_output", "checkpoint", "knowledge", "conversation"];
}
