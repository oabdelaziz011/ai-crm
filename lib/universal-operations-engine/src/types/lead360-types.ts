export type Lead360WorkspaceRole = "sales_rep" | "sales_manager" | "executive";

export type Lead360SectionId =
  | "overview"
  | "company"
  | "contacts"
  | "activities"
  | "timeline"
  | "tags"
  | "files"
  | "custom_fields"
  | "tasks"
  | "bookings"
  | "invoices"
  | "ai_assistant"
  | "related_entities"
  | "communication"
  | "audit";

export type Lead360SectionConfig = {
  id: Lead360SectionId;
  titleKey: string;
  visible: boolean;
  collapsed: boolean;
  permissions: string[];
  roles: Lead360WorkspaceRole[];
  sortOrder: number;
};

export const DEFAULT_LEAD360_SECTIONS: Lead360SectionConfig[] = [
  { id: "overview", titleKey: "leads360.sections.overview", visible: true, collapsed: false, permissions: ["leads.view"], roles: ["sales_rep", "sales_manager", "executive"], sortOrder: 0 },
  { id: "company", titleKey: "leads360.sections.company", visible: true, collapsed: false, permissions: ["leads.view"], roles: ["sales_rep", "sales_manager", "executive"], sortOrder: 1 },
  { id: "contacts", titleKey: "leads360.sections.contacts", visible: true, collapsed: false, permissions: ["entity.contacts.read"], roles: ["sales_rep", "sales_manager", "executive"], sortOrder: 2 },
  { id: "activities", titleKey: "leads360.sections.activities", visible: true, collapsed: false, permissions: ["entity.activities.read"], roles: ["sales_rep", "sales_manager", "executive"], sortOrder: 3 },
  { id: "timeline", titleKey: "leads360.sections.timeline", visible: true, collapsed: false, permissions: ["leads.view"], roles: ["sales_rep", "sales_manager", "executive"], sortOrder: 4 },
  { id: "tags", titleKey: "leads360.sections.tags", visible: true, collapsed: false, permissions: ["entity.tags.read"], roles: ["sales_rep", "sales_manager", "executive"], sortOrder: 5 },
  { id: "files", titleKey: "leads360.sections.files", visible: true, collapsed: false, permissions: ["entity.files.read"], roles: ["sales_rep", "sales_manager"], sortOrder: 6 },
  { id: "custom_fields", titleKey: "leads360.sections.customFields", visible: true, collapsed: false, permissions: ["entity.custom_fields.read"], roles: ["sales_rep", "sales_manager"], sortOrder: 7 },
  { id: "tasks", titleKey: "leads360.sections.tasks", visible: true, collapsed: true, permissions: ["leads.view"], roles: ["sales_rep", "sales_manager"], sortOrder: 8 },
  { id: "bookings", titleKey: "leads360.sections.bookings", visible: true, collapsed: true, permissions: ["bookings.view"], roles: ["sales_rep", "sales_manager"], sortOrder: 9 },
  { id: "invoices", titleKey: "leads360.sections.invoices", visible: true, collapsed: true, permissions: ["invoices.view"], roles: ["sales_manager", "executive"], sortOrder: 10 },
  { id: "communication", titleKey: "leads360.sections.communication", visible: true, collapsed: false, permissions: ["leads.view"], roles: ["sales_rep", "sales_manager"], sortOrder: 11 },
  { id: "related_entities", titleKey: "leads360.sections.relatedEntities", visible: true, collapsed: true, permissions: ["leads.view"], roles: ["sales_manager", "executive"], sortOrder: 12 },
  { id: "ai_assistant", titleKey: "leads360.sections.aiAssistant", visible: true, collapsed: false, permissions: ["ai.write"], roles: ["sales_rep", "sales_manager", "executive"], sortOrder: 13 },
  { id: "audit", titleKey: "leads360.sections.audit", visible: true, collapsed: true, permissions: ["audit_logs.view"], roles: ["sales_manager", "executive"], sortOrder: 14 },
];

export function resolveLead360Sections(
  sections: Lead360SectionConfig[],
  role: Lead360WorkspaceRole,
  hasPermission: (code: string) => boolean,
): Lead360SectionConfig[] {
  return sections
    .filter((section) => {
      if (!section.visible || !section.roles.includes(role)) return false;
      if (section.permissions.length === 0) return true;
      return section.permissions.some((code) => hasPermission(code));
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
