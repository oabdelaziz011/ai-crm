import type { AutomationNodeType, AutomationTriggerType } from "../constants.js";

export type WorkflowVersionStatus = "published" | "archived";

export type WorkflowGraphSnapshot = {
  name: string;
  description: string;
  triggerType: AutomationTriggerType;
  metadata: Record<string, unknown>;
  nodes: WorkflowGraphSnapshotNode[];
  edges: WorkflowGraphSnapshotEdge[];
};

export type WorkflowGraphSnapshotNode = {
  id: string;
  type: AutomationNodeType;
  config: Record<string, unknown>;
  positionX: number;
  positionY: number;
};

export type WorkflowGraphSnapshotEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  condition: Record<string, unknown>;
};

export type AutomationFlowVersionRecord = {
  id: string;
  flow_id: string;
  company_id: string;
  version_number: number;
  status: WorkflowVersionStatus;
  release_notes: string;
  snapshot: WorkflowGraphSnapshot;
  is_active: boolean;
  is_immutable: boolean;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
};

export type CreateAutomationFlowVersionInput = {
  flowId: string;
  companyId: string;
  versionNumber: number;
  releaseNotes?: string;
  snapshot: WorkflowGraphSnapshot;
  publishedBy?: string | null;
};

export type WorkflowPublishValidationIssue = {
  id: string;
  message: string;
  severity: "error" | "warning";
};

export type WorkflowVersionComparison = {
  addedNodes: string[];
  removedNodes: string[];
  changedNodeProperties: Array<{ nodeId: string; label: string }>;
  addedConnections: string[];
  removedConnections: string[];
  changedConnections: string[];
  validationDelta: {
    beforeErrors: number;
    afterErrors: number;
  };
};

export type WorkflowLifecycleAuditEntry = {
  id: string;
  flowId: string;
  companyId: string;
  action:
    | "workflow_created"
    | "draft_saved"
    | "published"
    | "rolled_back"
    | "archived";
  versionNumber?: number;
  userId: string | null;
  timestamp: string;
  details?: Record<string, unknown>;
};

export type PublishWorkflowInput = {
  flowId: string;
  snapshot: WorkflowGraphSnapshot;
  releaseNotes?: string;
};

export type RollbackWorkflowInput = {
  flowId: string;
  targetVersionNumber: number;
  restoreDraft?: boolean;
};
