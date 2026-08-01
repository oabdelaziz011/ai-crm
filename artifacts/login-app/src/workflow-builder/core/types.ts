export const BUILDER_NODE_TYPES = [
  "start",
  "send_message",
  "ask_question",
  "date_picker",
  "buttons",
  "list",
  "delay",
  "wait_for_reply",
  "if_else",
  "switch",
  "merge",
  "end",
  "return_to_main_menu",
  "create_customer",
  "update_customer",
  "find_customer",
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
  /** Stable builder-side identity for editor mounting; preserved across save id remaps. */
  clientKey?: string;
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
  /** Feature-owned slices keyed by extension id (e.g. triggerConfig). Core does not interpret contents. */
  extensions?: Record<string, unknown>;
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

export type ValidationFixActionType =
  | "insert_node"
  | "connect_node"
  | "set_property"
  | "delete_node"
  | "custom";

export type ValidationFixAction = {
  id: string;
  label: string;
  labelKey?: string;
  description?: string;
  descriptionKey?: string;
  actionType: ValidationFixActionType;
  payload?: unknown;
};

export type ValidationIssueKind =
  | "dead-end"
  | "branch-dead-end"
  | "path-no-terminal"
  | "non-terminating-cycle"
  | "unreachable";

export type ValidationIssue = {
  id: string;
  message: string;
  nodeId?: string;
  severity: "error" | "warning";
  fieldLabelKey?: string;
  branchLabel?: string;
  nodeType?: BuilderNodeType;
  kind?: ValidationIssueKind;
  affectedNodeIds?: string[];
  affectedEdgeIds?: string[];
  pathNodeIds?: string[];
  pathEdgeIds?: string[];
  suggestedFixKeys?: string[];
  focusNodeId?: string;
  fixActions?: ValidationFixAction[];
};

export type BuilderState = {
  document: WorkflowDocument;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  saveStatus: SaveStatus;
  validationIssues: ValidationIssue[];
  activeValidationIssueId: string | null;
  validationPanelFocusNonce: number;
  clipboard: BuilderNode[];
  layoutAnimationEnabled: boolean;
};

export type BuilderAction =
  | { type: "LOAD_DOCUMENT"; document: WorkflowDocument }
  | {
      type: "SET_METADATA";
      patch: Partial<Pick<WorkflowDocument, "name" | "description" | "triggerType" | "extensions">>;
      batch?: boolean;
    }
  | { type: "ADD_NODE"; node: BuilderNode }
  | { type: "UPDATE_NODE_CONFIG"; nodeId: string; patch: Record<string, unknown>; batch?: boolean }
  | { type: "UPDATE_NODE_POSITIONS"; positions: Array<{ id: string; x: number; y: number }>; transient?: boolean }
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
  | { type: "GENERATE_INTERACTIVE_ROUTING"; interactiveNodeId: string }
  | { type: "SET_SAVE_STATUS"; status: SaveStatus }
  | { type: "SET_VALIDATION"; issues: ValidationIssue[] }
  | { type: "SET_ACTIVE_VALIDATION_ISSUE"; issueId: string | null }
  | { type: "REQUEST_VALIDATION_PANEL_FOCUS" }
  | { type: "FLUSH_HISTORY_BATCH" }
  | { type: "SET_LAYOUT_ANIMATION"; enabled: boolean }
  | { type: "REPLACE_STATE"; state: BuilderState };

export function createNodeId(): string {
  return crypto.randomUUID();
}

export function createEdgeId(source: string, target: string): string {
  return `${source}->${target}`;
}
