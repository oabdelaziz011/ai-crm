import type { WorkspaceFavorite } from "../types/favorites-types.js";

export const MOCK_FAVORITES: WorkspaceFavorite[] = [
  { id: "fav_c1", type: "customer", label: "Sara Hassan", href: "/operations/queue", icon: "User", pinnedAt: new Date(Date.now() - 86400_000).toISOString() },
  { id: "fav_view_waiting", type: "view", label: "Waiting Room Queue", href: "/operations/queue", icon: "List", pinnedAt: new Date(Date.now() - 172800_000).toISOString() },
  { id: "fav_report_revenue", type: "report", label: "Daily Revenue Report", href: "/operations/analytics", icon: "BarChart3", pinnedAt: new Date(Date.now() - 259200_000).toISOString() },
  { id: "fav_cmd_collect", type: "command", label: "Collect Payment", actionKey: "collect_payment", icon: "CreditCard", pinnedAt: new Date(Date.now() - 345600_000).toISOString() },
  { id: "fav_ws_clinic", type: "workspace", label: "Clinic Workspace", href: "/operations/hub", icon: "Stethoscope", pinnedAt: new Date(Date.now() - 432000_000).toISOString() },
];
