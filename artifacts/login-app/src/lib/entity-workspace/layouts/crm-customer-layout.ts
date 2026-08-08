import type { EntityWorkspaceLayoutDefinition } from "../types";

/** CRM Entity Workspace — sales / relationship oriented composition. */
export const CRM_CUSTOMER_LAYOUT: EntityWorkspaceLayoutDefinition = {
  moduleId: "crm",
  entityTypes: ["customer"],
  titleKey: "entityWorkspace.layouts.crm",
  defaultTab: "overview",
  hideCrmSalesWidgets: false,
  showOperationContext: false,
  panels: [
    { id: "overview", titleKey: "entityWorkspace.panels.overview", surface: "tab", order: 10 },
    { id: "customer-value", titleKey: "entityWorkspace.panels.customerValue", surface: "widget", order: 15 },
    { id: "lead-score", titleKey: "entityWorkspace.panels.leadScore", surface: "widget", order: 20 },
    { id: "deals", titleKey: "entityWorkspace.panels.deals", surface: "widget", order: 25, comingSoon: true },
    { id: "campaigns", titleKey: "entityWorkspace.panels.campaigns", surface: "widget", order: 30, comingSoon: true },
    { id: "timeline", titleKey: "entityWorkspace.panels.timeline", surface: "tab", order: 40 },
    { id: "activities", titleKey: "entityWorkspace.panels.activities", surface: "widget", order: 45 },
    { id: "bookings", titleKey: "entityWorkspace.panels.bookings", surface: "tab", order: 50 },
    { id: "invoices", titleKey: "entityWorkspace.panels.invoices", surface: "tab", order: 55 },
    { id: "payments", titleKey: "entityWorkspace.panels.payments", surface: "tab", order: 60 },
    { id: "communication", titleKey: "entityWorkspace.panels.communication", surface: "tab", order: 70 },
    { id: "notes", titleKey: "entityWorkspace.panels.notes", surface: "tab", order: 75 },
    { id: "attachments", titleKey: "entityWorkspace.panels.attachments", surface: "tab", order: 80 },
    { id: "tags", titleKey: "entityWorkspace.panels.tags", surface: "widget", order: 85 },
    { id: "custom-fields", titleKey: "entityWorkspace.panels.customFields", surface: "widget", order: 90 },
    { id: "ai-summary", titleKey: "entityWorkspace.panels.aiSummary", surface: "tab", order: 95 },
    { id: "history", titleKey: "entityWorkspace.panels.history", surface: "tab", order: 100 },
  ],
};
