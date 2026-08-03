import type { WorkspaceCommand } from "../types/command-types.js";

const ALL_ROLES = ["receptionist", "cashier", "nurse", "manager"];

export const DEFAULT_COMMANDS: WorkspaceCommand[] = [
  { id: "cmd_create_customer", labelKey: "commands.createCustomer", category: "create", icon: "UserPlus", roles: ALL_ROLES, permissions: [], actionKey: "create_customer", keywords: ["customer", "new", "create"] },
  { id: "cmd_create_booking", labelKey: "commands.createBooking", category: "create", icon: "Calendar", roles: ALL_ROLES, permissions: [], actionKey: "create_booking", keywords: ["booking", "appointment", "schedule"] },
  { id: "cmd_collect_payment", labelKey: "commands.collectPayment", category: "action", icon: "CreditCard", roles: ["cashier", "manager"], permissions: [], actionKey: "collect_payment", keywords: ["payment", "collect", "pay"] },
  { id: "cmd_generate_invoice", labelKey: "commands.generateInvoice", category: "create", icon: "FileText", roles: ["cashier", "manager"], permissions: [], actionKey: "generate_invoice", keywords: ["invoice", "bill"] },
  { id: "cmd_open_crm", labelKey: "commands.openCrm", category: "navigate", icon: "Users", roles: ALL_ROLES, permissions: [], actionKey: "open_crm", keywords: ["crm", "customers"] },
  { id: "cmd_open_timeline", labelKey: "commands.openTimeline", category: "navigate", icon: "Clock", roles: ALL_ROLES, permissions: [], actionKey: "open_timeline", keywords: ["timeline", "history"] },
  { id: "cmd_search_customer", labelKey: "commands.searchCustomer", category: "search", icon: "Search", shortcut: "/", roles: ALL_ROLES, permissions: [], actionKey: "search_customer", keywords: ["search", "find", "customer"] },
  { id: "cmd_assign_employee", labelKey: "commands.assignEmployee", category: "action", icon: "UserCheck", roles: ["manager", "receptionist"], permissions: [], actionKey: "assign_employee", keywords: ["assign", "employee", "staff"] },
  { id: "cmd_create_task", labelKey: "commands.createTask", category: "create", icon: "CheckSquare", roles: ALL_ROLES, permissions: [], actionKey: "create_task", keywords: ["task", "todo"] },
  { id: "cmd_ai_summary", labelKey: "commands.aiSummary", category: "ai", icon: "Sparkles", roles: ALL_ROLES, permissions: [], actionKey: "ai_summary", keywords: ["ai", "summary", "summarize"] },
  { id: "cmd_switch_workspace", labelKey: "commands.switchWorkspace", category: "workspace", icon: "LayoutGrid", roles: ALL_ROLES, permissions: [], actionKey: "switch_workspace", keywords: ["workspace", "switch", "template"] },
  { id: "cmd_nav_queue", labelKey: "commands.navQueue", category: "navigate", shortcut: "G O", icon: "List", roles: ALL_ROLES, permissions: [], actionKey: "nav_queue", keywords: ["queue", "operations"] },
  { id: "cmd_nav_hub", labelKey: "commands.navHub", category: "navigate", shortcut: "G H", icon: "Home", roles: ALL_ROLES, permissions: [], actionKey: "nav_hub", keywords: ["hub", "home", "dashboard"] },
  { id: "cmd_nav_designer", labelKey: "commands.navDesigner", category: "navigate", icon: "Palette", roles: ["manager"], permissions: ["operations.universal.configure"], actionKey: "nav_designer", keywords: ["designer", "layout", "admin"] },
];
