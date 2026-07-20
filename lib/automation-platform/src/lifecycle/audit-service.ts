import type { WorkflowLifecycleAuditEntry } from "./types.js";

export class WorkflowAuditService {
  private readonly entries: WorkflowLifecycleAuditEntry[] = [];

  record(entry: Omit<WorkflowLifecycleAuditEntry, "id" | "timestamp"> & { timestamp?: string }): WorkflowLifecycleAuditEntry {
    const stored: WorkflowLifecycleAuditEntry = {
      id: crypto.randomUUID(),
      timestamp: entry.timestamp ?? new Date().toISOString(),
      flowId: entry.flowId,
      companyId: entry.companyId,
      action: entry.action,
      versionNumber: entry.versionNumber,
      userId: entry.userId,
      details: entry.details,
    };
    this.entries.unshift(stored);
    return stored;
  }

  listByFlowId(flowId: string): WorkflowLifecycleAuditEntry[] {
    return this.entries.filter((entry) => entry.flowId === flowId);
  }
}
