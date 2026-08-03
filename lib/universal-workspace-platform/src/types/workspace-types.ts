export type WorkspaceEntityType =
  | "customer"
  | "lead"
  | "employee"
  | "invoice"
  | "order"
  | "ticket"
  | "project"
  | "asset"
  | "company"
  | "contract";

export type WorkspaceBlockType =
  | "card"
  | "widget"
  | "section"
  | "tab"
  | "kpi"
  | "list"
  | "chart"
  | "timeline"
  | "form"
  | "ai_card"
  | "report"
  | "communication"
  | "tasks"
  | "files"
  | "invoices"
  | "bookings";

export type WorkspaceDensity = "compact" | "comfortable" | "spacious";
export type WorkspaceTheme = "system" | "light" | "dark";

export type WorkspaceBlockConfig = {
  id: string;
  type: WorkspaceBlockType;
  labelKey: string;
  visible: boolean;
  collapsed: boolean;
  pinned: boolean;
  sortOrder: number;
  roles: string[];
  permissions: string[];
  icon?: string;
  color?: string;
};

export type WorkspaceDefinition = {
  id: string;
  entityType: WorkspaceEntityType;
  templateKey: string;
  labelKey: string;
  icon: string;
  blocks: WorkspaceBlockConfig[];
};

export type WorkspaceContext = {
  entityType: WorkspaceEntityType;
  entityId: string;
  entityLabel: string;
  templateKey: string;
  reference?: string;
};

export function resolveWorkspaceBlocks(
  blocks: WorkspaceBlockConfig[],
  role: string,
): WorkspaceBlockConfig[] {
  return blocks
    .filter((b) => b.visible && b.roles.includes(role))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
