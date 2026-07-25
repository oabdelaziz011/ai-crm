import type { AutomationFlowRecord } from "../types.js";
import type { AutomationFlowVersionRecord, WorkflowGraphSnapshot } from "./types.js";

export type AtomicPublishWorkflowInput = {
  flowId: string;
  companyId: string;
  releaseNotes?: string;
  snapshot: WorkflowGraphSnapshot;
  publishedBy?: string | null;
  updatedBy?: string | null;
};

export type AtomicPublishWorkflowResult = {
  flow: AutomationFlowRecord;
  version: AutomationFlowVersionRecord;
};

export interface WorkflowPublishTransactionRepository {
  publishAtomically(input: AtomicPublishWorkflowInput): Promise<AtomicPublishWorkflowResult>;
}
