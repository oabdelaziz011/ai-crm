import type { ComponentType } from "react";
import type {
  OperationsCustomer360WorkspaceData,
  OperationsRow,
  OperationsWorkspaceConfig,
} from "@workspace/universal-operations-engine";

export type OperationWorkspaceTabId =
  | "overview"
  | "timeline"
  | "customer"
  | "payments"
  | "notes"
  | "files"
  | "ai"
  | "history"
  | "related";

export type OperationWidgetModule =
  | "crm"
  | "billing"
  | "appointments"
  | "ai"
  | "history"
  | "operations"
  | "related";

export type OperationWidgetContext = {
  row: OperationsRow;
  config: OperationsWorkspaceConfig | undefined;
  customer360: OperationsCustomer360WorkspaceData | null;
  templateKey: string;
  activeTab: OperationWorkspaceTabId;
};

export type OperationWidgetDefinition = {
  id: string;
  module: OperationWidgetModule;
  titleKey: string;
  order: number;
  /** Tabs where this widget may render. */
  tabs: OperationWorkspaceTabId[];
  comingSoon?: boolean;
  visible: (ctx: OperationWidgetContext) => boolean;
  Component: ComponentType<{ ctx: OperationWidgetContext }>;
};

export type ResolvedOperationWidget = OperationWidgetDefinition & {
  title: string;
};
