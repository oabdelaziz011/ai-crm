import type { WorkspaceWidgetConfig } from "../types/widget-types.js";

export const DEFAULT_WIDGETS: WorkspaceWidgetConfig[] = [
  { id: "w_revenue", type: "revenue_today", labelKey: "widgets.revenueToday", icon: "DollarSign", size: "md", visible: true, pinned: true, sortOrder: 0, roles: ["manager", "cashier"], permissions: [] },
  { id: "w_bookings", type: "upcoming_bookings", labelKey: "widgets.upcomingBookings", icon: "Calendar", size: "md", visible: true, pinned: false, sortOrder: 1, roles: ["manager", "receptionist"], permissions: [] },
  { id: "w_payments", type: "pending_payments", labelKey: "widgets.pendingPayments", icon: "CreditCard", size: "md", visible: true, pinned: true, sortOrder: 2, roles: ["manager", "cashier"], permissions: [] },
  { id: "w_employees", type: "employee_status", labelKey: "widgets.employeeStatus", icon: "Users", size: "sm", visible: true, pinned: false, sortOrder: 3, roles: ["manager"], permissions: [] },
  { id: "w_ai", type: "ai_recommendations", labelKey: "widgets.aiRecommendations", icon: "Sparkles", size: "sm", visible: true, pinned: false, sortOrder: 4, roles: ["manager", "receptionist"], permissions: [] },
  { id: "w_tasks", type: "tasks", labelKey: "widgets.tasks", icon: "CheckSquare", size: "sm", visible: true, pinned: false, sortOrder: 5, roles: ["manager", "nurse"], permissions: [] },
  { id: "w_leaderboard", type: "kpi_leaderboard", labelKey: "widgets.leaderboard", icon: "Trophy", size: "lg", visible: true, pinned: false, sortOrder: 6, roles: ["manager"], permissions: [] },
];
