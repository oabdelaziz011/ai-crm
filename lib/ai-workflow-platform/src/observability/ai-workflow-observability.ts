export type AIWorkflowObservabilityEventType =
  | "node_started"
  | "schema_built"
  | "prompt_rendered"
  | "gateway_started"
  | "gateway_completed"
  | "extraction_validated"
  | "decision_started"
  | "decision_validated"
  | "knowledge_search_started"
  | "retrieval_started"
  | "retrieval_completed"
  | "results_ranked"
  | "knowledge_search_completed"
  | "node_completed"
  | "node_failed";

export type AIWorkflowObservabilityEvent = {
  type: AIWorkflowObservabilityEventType;
  timestamp: string;
  nodeKey: string;
  workflowId?: string | null;
  executionId?: string | null;
  companyId?: string | null;
  promptTemplateKey?: string | null;
  providerKey?: string | null;
  model?: string | null;
  latencyMs?: number | null;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
  estimatedCostUsd?: number | null;
  knowledgeUsed?: boolean;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

export type AIWorkflowObservabilityRecorder = (
  event: Omit<AIWorkflowObservabilityEvent, "timestamp"> & { timestamp?: string },
) => void;

export class AIWorkflowObservability {
  private readonly events: AIWorkflowObservabilityEvent[] = [];

  record(event: Omit<AIWorkflowObservabilityEvent, "timestamp"> & { timestamp?: string }): void {
    this.events.push({
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    });
  }

  list(): AIWorkflowObservabilityEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events.length = 0;
  }
}
