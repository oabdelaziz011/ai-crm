import type { AgentEmployeeExecutionContext } from "../../../../lib/ai-employees/utilities/agent-employee-execution-context";

export type AiEmployeeIntegrationScope = {
  companyId: string;
  flowId: string;
};

export type AiEmployeeIntegrationScenarioId =
  | "execution-context-created-once"
  | "execution-context-stable-across-ai-tasks"
  | "execution-context-reused-on-resume"
  | "execution-context-reused-on-continue"
  | "allowed-tool-executes-with-rbac"
  | "denied-tool-returns-scope-denial"
  | "knowledge-retrieval-from-execution-context"
  | "provider-selection-from-execution-context"
  | "draft-employee-cannot-execute"
  | "unpublished-employee-gating"
  | "multiple-employees-isolated-contexts"
  | "telemetry-stamps-runtime-decisions"
  | "workflow-testing-suite-registration"
  | "coordinator-execution-context-flows-to-prompt"
  | "coordinator-uses-employee-provider-from-context"
  | "floating-chat-reuses-execution-context"
  | "confirmation-pauses-before-merge-tool"
  | "confirmation-resumes-with-token"
  | "conversation-metadata-hydrates-execution-context"
  | "tool-call-loop-allowed-tool-routes-once"
  | "tool-call-loop-denied-tool-structured-denial"
  | "tool-call-loop-coordinator-path";

export type AiEmployeeIntegrationSuite = {
  id: string;
  name: string;
  description: string;
  scenarioIds: AiEmployeeIntegrationScenarioId[];
};

export type AiEmployeeIntegrationAssertionResult = {
  id: string;
  label: string;
  passed: boolean;
  message: string;
};

export type AiEmployeeIntegrationScenarioResult = {
  scenarioId: AiEmployeeIntegrationScenarioId;
  scenarioName: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  assertions: AiEmployeeIntegrationAssertionResult[];
  failures: string[];
  telemetry: AiEmployeeIntegrationTelemetrySnapshot;
  details: Record<string, unknown>;
};

export type AiEmployeeIntegrationRunRecord = {
  id: string;
  suiteId: string;
  suiteName: string;
  companyId: string;
  flowId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  passed: number;
  failed: number;
  skipped: number;
  scenarioResults: AiEmployeeIntegrationScenarioResult[];
  report: AiEmployeeIntegrationReportSnapshot;
};

export type AiEmployeeIntegrationReportSnapshot = {
  passed: number;
  failed: number;
  skipped: number;
  readinessScore: number;
  exportPayload: Record<string, unknown>;
};

export type AiEmployeeIntegrationTelemetrySnapshot = {
  events: AiEmployeeIntegrationTelemetryEvent[];
};

export type AiEmployeeIntegrationTelemetryEvent = {
  type:
    | "employee_binding_resolved"
    | "execution_context_created"
    | "runtime_chat_executed"
    | "tool_scope_decision"
    | "tool_router_executed"
    | "rbac_evaluated"
    | "provider_selected"
    | "knowledge_retrieval_configured";
  timestamp: string;
  employeeId?: string | null;
  toolKey?: string | null;
  allowed?: boolean;
  denied?: boolean;
  reason?: string | null;
  providerConnectionId?: string | null;
  knowledgeCollectionId?: string | null;
  metadata?: Record<string, unknown>;
};

export type CapturedRuntimeChatCall = {
  conversationId: string;
  pageContext: Record<string, unknown>;
  executionContext: AgentEmployeeExecutionContext | null;
};

export type CapturedToolRouteCall = {
  toolKey: string;
  status: string;
  errorCode?: string | null;
  rbacChecked: boolean;
};
