import type { AgentEventType, AgentTaskStatus, AgentWorkflowStatus } from "./constants.js";
import type { AgentConfirmationRequest } from "./confirmation/confirmation-types.js";

export type { AgentEventType, AgentTaskStatus, AgentWorkflowStatus };

export type ServiceContext = {
  userId: string | null;
  companyId: string | null;
  isSuperAdmin: boolean;
  hasPermission: (permissionCode: string) => boolean;
  /** When set, blocks agent start/resume/read when the Platform AI agents flag is off. */
  isAgentsFeatureEnabled?: () => boolean;
};

export type AgentRetrievalPolicy = "disabled" | "optional" | "required";

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
  retrievalPolicy?: AgentRetrievalPolicy;
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
  execution_lease_holder: string | null;
  execution_lease_expires_at: string | null;
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
  /** Runtime-only: issues pre-start confirmation tokens after planning (UI pre-confirm flow). */
  preStartConfirmationAcknowledged?: boolean;
  /** Optional recent conversation turns for knowledge context assembly. */
  conversationHistory?: string[];
  /** Recover an existing unfinished workflow instead of creating a new one. */
  recoverWorkflowId?: string;
};

export type AgentWorkflowResult = {
  workflowId: string;
  status: AgentWorkflowStatus;
  finalReport: string | null;
  taskGraph: AgentTaskGraph;
  events: AgentWorkflowEventRecord[];
  confirmationRequest?: AgentConfirmationRequest | null;
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
    errorCode?: string | null;
  }>;
  /** Resolves tool_definitions.required_permissions for pre-flight checks. */
  getRequiredPermissions?(toolKey: string): Promise<string[] | null>;
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
  ): Promise<{ responseContent: string; citations?: Array<Record<string, unknown>> }>;
};

export type AgentKnowledgeRetrievalInput = {
  companyId: string;
  question: string;
  searchMode?: "vector" | "keyword" | "hybrid";
  metadataFilters?: Record<string, unknown>;
  sourceIds?: string[];
  documentIds?: string[];
  policyKey?: string;
  minimumScore?: number;
  topK?: number;
  rerank?: boolean;
};

export type AgentKnowledgeRetrievalResult = {
  contextText: string;
  citations: Array<{
    citationId: string;
    sourceId: string;
    title: string;
    chunkId: string;
    confidence: number;
    score: number | null;
    excerpt: string;
    sectionTitle?: string | null;
  }>;
  chunks: Array<{
    id: string;
    content: string;
    title: string;
    sourceId: string;
    chunkId: string;
    confidence: number;
    score: number | null;
    tokenCount: number;
  }>;
  confidence: number;
  chunkCount: number;
  totalTokens: number;
  searchMode: "vector" | "keyword" | "hybrid";
  executionId: string | null;
  vectorQueryExecutionId: string | null;
};

export type KnowledgeRetrievalPort = {
  retrieve(ctx: ServiceContext, input: AgentKnowledgeRetrievalInput): Promise<AgentKnowledgeRetrievalResult>;
};

export type AgentRuntimePorts = {
  toolRouter: ToolRoutePort;
  runtimeChat?: RuntimeChatPort;
  knowledgeRetrieval?: KnowledgeRetrievalPort;
};
