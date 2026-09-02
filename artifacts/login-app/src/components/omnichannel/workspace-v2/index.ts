import "@/components/omnichannel/workspace-v2/workspace.css";

export { AgentWorkspace } from "@/components/omnichannel/workspace-v2/agent-workspace";
export type { AgentWorkspaceProps } from "@/components/omnichannel/workspace-v2/agent-workspace";
export {
  WORKSPACE_NAV_ORDER,
  WORKSPACE_NAV_ORDER_AGENT,
  workspaceNavOrderForAccess,
  coerceWorkspaceNavForAccess,
  workspaceNavToFilters,
  filtersToWorkspaceNav,
  countWorkspaceNav,
  type WorkspaceNavId,
} from "@/components/omnichannel/workspace-v2/workspace-nav";
