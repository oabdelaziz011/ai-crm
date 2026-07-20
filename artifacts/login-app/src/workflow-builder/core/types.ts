export const BUILDER_NODE_TYPES = [
  "start",
  "send_message",
  "ask_question",
  "buttons",
  "list",
  "delay",
  "wait_for_reply",
  "if_else",
  "switch",
  "merge",
  "end",
  "create_customer",
  "update_customer",
  "create_booking",
  "ai_summarizer",
  "ai_extract",
  "ai_decision",
  "ai_knowledge_search",
] as const;

export type BuilderNodeType = (typeof BUILDER_NODE_TYPES)[number];

export const BUILDER_NODE_CATEGORIES = ["conversation", "logic", "crm", "ai"] as const;
export type BuilderNodeCategory = (typeof BUILDER_NODE_CATEGORIES)[number];

export type BuilderBranchKey = "yes" | "no" | "default" | string;

export type BuilderNode = {
  id: string;
  type: BuilderNodeType;
  position: { x: number; y: number };
  config: Record<string, unknown>;
};

export type BuilderEdge = {
  id: string;
  source: string;
  target: string;
  branchKey?: BuilderBranchKey;
  branchLabel?: string;
};

export type BuilderViewport = {
  x: number;
  zoom: number;
  y: number;
};

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "publishing" | "published";

export type WorkflowDocument = {
  flowId: string;
  companyId: string;
  name: string;
  description: string;
  triggerType: "inbound_message" | "manual" | "webhook" | "schedule" | "api_event";
  status: "draft" | "active" | "disabled" | "archived";
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  viewport: BuilderViewport;
  activeVersionId?: string | null;
  activeVersionNumber?: number;
  hasUnpublishedDraft?: boolean;
  readOnly?: boolean;
};

export type WorkflowVersionSummary = {
  versionId: string;
  versionNumber: number;
  releaseNotes: string;
  publishedAt: string | null;
  publishedBy: string | null;
  status: "published" | "archived";
  isActive: boolean;
};

export type WorkflowSummary = {
  flowId: string;
  name: string;
  description: string;
  status: WorkflowDocument["status"];
  updatedAt: string;
  nodeCount: number;
  activeVersionNumber?: number;
  hasUnpublishedDraft?: boolean;
};

export type ValidationIssue = {
  id: string;
  message: string;
  nodeId?: string;
  severity: "error" | "warning";
  fieldLabelKey?: string;
  branchLabel?: string;
  nodeType?: BuilderNodeType;
};

export type BuilderState = {
  document: WorkflowDocument;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  saveStatus: SaveStatus;
  validationIssues: ValidationIssue[];
  clipboard: BuilderNode[];
};

export type BuilderAction =
  | { type: "LOAD_DOCUMENT"; document: WorkflowDocument }
  | { type: "SET_METADATA"; patch: Partial<Pick<WorkflowDocument, "name" | "description" | "triggerType">> }
  | { type: "ADD_NODE"; node: BuilderNode }
  | { type: "UPDATE_NODE_CONFIG"; nodeId: string; patch: Record<string, unknown> }
  | { type: "UPDATE_NODE_POSITIONS"; positions: Array<{ id: string; x: number; y: number }> }
  | { type: "DELETE_NODES"; nodeIds: string[] }
  | { type: "ADD_EDGE"; edge: BuilderEdge }
  | { type: "DELETE_EDGES"; edgeIds: string[] }
  | { type: "SET_VIEWPORT"; viewport: BuilderViewport }
  | { type: "SELECT_NODES"; nodeIds: string[] }
  | { type: "SELECT_EDGES"; edgeIds: string[] }
  | { type: "COPY_NODES"; nodeIds: string[] }
  | { type: "PASTE_NODES"; offset?: { x: number; y: number } }
  | { type: "DUPLICATE_NODES"; nodeIds: string[]; offset?: { x: number; y: number } }
  | { type: "INSERT_NODE_AFTER"; sourceNodeId: string; node: BuilderNode }
  | { type: "SET_SAVE_STATUS"; status: SaveStatus }
  | { type: "SET_VALIDATION"; issues: ValidationIssue[] }
  | { type: "REPLACE_STATE"; state: BuilderState };

export function createNodeId(): string {
  return crypto.randomUUID();
}

export function createEdgeId(source: string, target: string): string {
  return `${source}->${target}`;
}
