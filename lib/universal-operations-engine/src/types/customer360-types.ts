export type Customer360WorkspaceRole = "receptionist" | "cashier" | "nurse" | "manager";

export type Customer360SectionId =
  | "todays_operation"
  | "customer_summary"
  | "communication"
  | "timeline"
  | "notes"
  | "invoices_payments"
  | "bookings"
  | "files"
  | "tasks"
  | "ai_assistant";

export type Customer360SectionConfig = {
  id: Customer360SectionId;
  titleKey: string;
  visible: boolean;
  collapsed: boolean;
  permissions: string[];
  roles: Customer360WorkspaceRole[];
  sortOrder: number;
};

export const DEFAULT_CUSTOMER360_SECTIONS: Customer360SectionConfig[] = [
  { id: "todays_operation", titleKey: "sections.todaysOperation", visible: true, collapsed: false, permissions: [], roles: ["receptionist", "nurse", "manager"], sortOrder: 0 },
  { id: "customer_summary", titleKey: "sections.customerSummary", visible: true, collapsed: false, permissions: [], roles: ["receptionist", "cashier", "nurse", "manager"], sortOrder: 1 },
  { id: "communication", titleKey: "sections.communication", visible: true, collapsed: false, permissions: [], roles: ["receptionist", "nurse", "manager"], sortOrder: 2 },
  { id: "timeline", titleKey: "sections.timeline", visible: true, collapsed: false, permissions: [], roles: ["receptionist", "nurse", "manager"], sortOrder: 3 },
  { id: "notes", titleKey: "sections.notes", visible: true, collapsed: false, permissions: [], roles: ["receptionist", "nurse", "manager"], sortOrder: 4 },
  { id: "invoices_payments", titleKey: "sections.invoicesPayments", visible: true, collapsed: false, permissions: [], roles: ["receptionist", "cashier", "manager"], sortOrder: 5 },
  { id: "bookings", titleKey: "sections.bookings", visible: true, collapsed: false, permissions: [], roles: ["receptionist", "nurse", "manager"], sortOrder: 6 },
  { id: "files", titleKey: "sections.files", visible: true, collapsed: false, permissions: [], roles: ["nurse", "manager"], sortOrder: 7 },
  { id: "tasks", titleKey: "sections.tasks", visible: true, collapsed: false, permissions: [], roles: ["nurse", "manager"], sortOrder: 8 },
  { id: "ai_assistant", titleKey: "sections.aiAssistant", visible: true, collapsed: false, permissions: [], roles: ["receptionist", "cashier", "nurse", "manager"], sortOrder: 9 },
];

export function resolveVisibleSections(
  sections: Customer360SectionConfig[],
  role: Customer360WorkspaceRole,
): Customer360SectionConfig[] {
  return sections
    .filter((s) => s.visible && s.roles.includes(role))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
