import type { AgentEventType, AgentTaskStatus, AgentWorkflowStatus } from "./constants.js";

export type { AgentEventType, AgentTaskStatus, AgentWorkflowStatus };

export type ServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
};

export type AgentTaskEdge = {
  from: string;
  to: string;
  /** When set, edge is taken only if condition evaluates true */
  condition?: "on_success" | "on_failure" | "always";
  rollbackMarker?: boolean;
};

export type AgentTaskNode = {
  id: string;
  title: string;
  description: string;
  tool: string | null;
  toolInput?: Record<string, unknown>;
  status: AgentTaskStatus;
  dependencies: string[];
  estimatedDurationMs?: number;
  retryCount: number;
  maxRetries: number;
  result?: Record<string, unknown> | null;
  error?: string | null;
  verificationRule?: string;
  parallelGroup?: string;
  rollbackMarker?: boolean;
};

export type AgentTaskGraph = {
  workflowId: string;
  goal: string;
  nodes: AgentTaskNode[];
  edges: AgentTaskEdge[];
  agentType?: "crm" | "generic";
};

export type AgentMemoryState = {
  goal: string;
  variables: Record<string, unknown>;
  completedTaskIds: string[];
  pendingTaskIds: string[];
  toolOutputs: Record<string, unknown>;
  executionState: Record<string, unknown>;
};

export type AgentWorkflowRecord = {
  id: string;
  company_id: string;
  user_id: string | null;
  conversation_id: string | null;
  goal: string;
  status: AgentWorkflowStatus;
  task_graph: AgentTaskGraph;
  memory: AgentMemoryState;
  correlation_id: string;
  checkpoint_index: number;
  error_message: string | null;
  final_report: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type AgentWorkflowEventRecord = {
  id: string;
  workflow_id: string;
  company_id: string;
  event_type: AgentEventType;
  task_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export type StartAgentWorkflowInput = {
  companyId: string;
  userId?: string | null;
  conversationId?: string | null;
  goal: string;
  pageContext?: Record<string, unknown>;
  correlationId?: string;
  agentType?: "crm" | "generic";
};

export type AgentWorkflowResult = {
  workflowId: string;
  status: AgentWorkflowStatus;
  finalReport: string | null;
  taskGraph: AgentTaskGraph;
  events: AgentWorkflowEventRecord[];
};

export type ToolRoutePort = {
  route(
    ctx: ServiceContext,
    input: {
      conversationId: string;
      toolKey: string;
      input: Record<string, unknown>;
    },
  ): Promise<{
    executionId: string;
    status: string;
    output: Record<string, unknown> | null;
    errorMessage?: string | null;
  }>;
};

export type RuntimeChatPort = {
  execute(
    ctx: ServiceContext,
    input: {
      companyId: string;
      conversationId: string;
      messageText: string;
      pageContext?: Record<string, unknown>;
    },
  ): Promise<{ responseContent: string }>;
};

export type AgentRuntimePorts = {
  toolRouter: ToolRoutePort;
  runtimeChat?: RuntimeChatPort;
};
