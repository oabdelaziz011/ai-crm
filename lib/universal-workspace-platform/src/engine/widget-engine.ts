import type { WorkspaceWidgetConfig, WorkspaceWidgetSnapshot } from "../types/widget-types.js";
import { DEFAULT_WIDGETS } from "../mock/mock-widgets.js";

export class WidgetEngine {
  private readonly registry: WorkspaceWidgetConfig[];

  constructor(registry?: WorkspaceWidgetConfig[]) {
    this.registry = registry ?? DEFAULT_WIDGETS;
  }

  list(role: string): WorkspaceWidgetConfig[] {
    return this.registry
      .filter((w) => w.visible && w.roles.includes(role))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  buildSnapshots(role: string): WorkspaceWidgetSnapshot[] {
    return this.list(role).map((w) => ({
      widgetId: w.id,
      type: w.type,
      title: w.labelKey,
      data: (MOCK_WIDGET_DATA[w.type] ?? []) as WorkspaceWidgetSnapshot["data"],
      updatedAt: new Date().toISOString(),
    }));
  }
}

const MOCK_WIDGET_DATA: Record<string, unknown> = {
  revenue_today: [
    { id: "r1", label: "Today", value: "$12,480", trend: "+8%", tone: "success" },
    { id: "r2", label: "Target", value: "78%", tone: "default" },
  ],
  upcoming_bookings: [
    { id: "b1", label: "Next 2h", value: 14, tone: "warning" },
    { id: "b2", label: "Today", value: 47, tone: "default" },
  ],
  pending_payments: [
    { id: "p1", label: "Outstanding", value: "$3,240", tone: "danger" },
    { id: "p2", label: "Overdue", value: 5, tone: "warning" },
  ],
  employee_status: [
    { id: "e1", label: "On duty", value: 12, tone: "success" },
    { id: "e2", label: "Late", value: 2, tone: "warning" },
  ],
  ai_recommendations: [
    { id: "a1", label: "Pending", value: 8, tone: "default" },
    { id: "a2", label: "High confidence", value: 3, tone: "success" },
  ],
  tasks: [
    { id: "t1", label: "Open", value: 23, tone: "default" },
    { id: "t2", label: "Due today", value: 7, tone: "warning" },
  ],
  kpi_leaderboard: [
    { id: "l1", label: "Top performer", value: "Sara M.", tone: "success" },
    { id: "l2", label: "Revenue", value: "$4,200", tone: "default" },
  ],
};

export const widgetEngine = new WidgetEngine();
