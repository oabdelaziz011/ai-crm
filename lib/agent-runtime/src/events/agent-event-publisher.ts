import type { AgentEventType } from "../constants.js";
import type { AgentWorkflowEventRecord } from "../types.js";

export type AgentEventInput = {
  workflowId: string;
  companyId: string;
  eventType: AgentEventType;
  taskId?: string | null;
  payload?: Record<string, unknown>;
};

export class AgentEventPublisher {
  private readonly listeners = new Set<(event: AgentWorkflowEventRecord) => void>();

  subscribe(listener: (event: AgentWorkflowEventRecord) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(record: AgentWorkflowEventRecord): void {
    for (const listener of this.listeners) {
      listener(record);
    }
  }

  static toRecord(input: AgentEventInput): Omit<AgentWorkflowEventRecord, "id" | "created_at"> {
    return {
      workflow_id: input.workflowId,
      company_id: input.companyId,
      event_type: input.eventType,
      task_id: input.taskId ?? null,
      payload: input.payload ?? {},
    };
  }
}
