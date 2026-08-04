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

export function resolveVisibleSections(
  sections: Customer360SectionConfig[],
  role: Customer360WorkspaceRole,
): Customer360SectionConfig[] {
  return sections
    .filter((s) => s.visible && s.roles.includes(role))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
