export type KnowledgeObservabilityEvent = {
  type:
    | "ingestion_started"
    | "ingestion_completed"
    | "embedding_completed"
    | "retrieval_completed"
    | "ranking_completed"
    | "worker_failed";
  companyId: string;
  documentId?: string;
  executionId?: string;
  timestamp: string;
  metrics: Record<string, number | string | boolean | null>;
};

export class KnowledgeObservability {
  private readonly events: KnowledgeObservabilityEvent[] = [];

  record(event: Omit<KnowledgeObservabilityEvent, "timestamp">): KnowledgeObservabilityEvent {
    const record = { ...event, timestamp: new Date().toISOString() };
    this.events.push(record);
    return record;
  }

  list(): KnowledgeObservabilityEvent[] {
    return [...this.events];
  }

  listByCompany(companyId: string): KnowledgeObservabilityEvent[] {
    return this.events.filter((event) => event.companyId === companyId);
  }

  summary(companyId?: string) {
    const scoped = companyId ? this.listByCompany(companyId) : this.events;
    return {
      totalEvents: scoped.length,
      retrievalEvents: scoped.filter((event) => event.type === "retrieval_completed").length,
      failures: scoped.filter((event) => event.type === "worker_failed").length,
    };
  }
}
