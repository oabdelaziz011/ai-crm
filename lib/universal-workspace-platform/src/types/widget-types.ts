export type WidgetSize = "sm" | "md" | "lg" | "full";

export type WorkspaceWidgetConfig = {
  id: string;
  type: string;
  labelKey: string;
  icon: string;
  size: WidgetSize;
  visible: boolean;
  pinned: boolean;
  sortOrder: number;
  roles: string[];
  permissions: string[];
  refreshIntervalSec?: number;
};

export type WidgetDataPoint = {
  id: string;
  label: string;
  value: string | number;
  trend?: string;
  tone?: "default" | "success" | "warning" | "danger";
};

export type WorkspaceWidgetSnapshot = {
  widgetId: string;
  type: string;
  title: string;
  data: WidgetDataPoint[] | Record<string, unknown>;
  updatedAt: string;
};

export function resolveVisibleWidgets(
  widgets: WorkspaceWidgetConfig[],
  role: string,
): WorkspaceWidgetConfig[] {
  return widgets
    .filter((w) => w.visible && w.roles.includes(role))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
