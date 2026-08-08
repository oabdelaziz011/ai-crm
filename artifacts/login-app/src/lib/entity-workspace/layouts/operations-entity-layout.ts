import type { EntityWorkspaceLayoutDefinition } from "../types";

/**
 * Operations Entity Workspace — operational widgets only.
 * No CRM sales cards (lead score, deals, campaigns, customer value).
 */
export const OPERATIONS_ENTITY_LAYOUT: EntityWorkspaceLayoutDefinition = {
  moduleId: "operations",
  entityTypes: ["customer", "booking", "project", "asset", "employee", "supplier"],
  titleKey: "entityWorkspace.layouts.operations",
  defaultTab: "overview",
  hideCrmSalesWidgets: true,
  showOperationContext: true,
  panels: [
    { id: "overview", titleKey: "entityWorkspace.panels.overview", surface: "tab", order: 10 },
    { id: "current-operation", titleKey: "entityWorkspace.panels.currentOperation", surface: "widget", order: 15 },
    { id: "operation-status", titleKey: "entityWorkspace.panels.operationStatus", surface: "widget", order: 20 },
    { id: "assigned-resource", titleKey: "entityWorkspace.panels.assignedResource", surface: "widget", order: 25 },
    { id: "notes", titleKey: "entityWorkspace.panels.notes", surface: "tab", order: 40 },
    { id: "attachments", titleKey: "entityWorkspace.panels.attachments", surface: "tab", order: 50 },
    { id: "timeline", titleKey: "entityWorkspace.panels.timeline", surface: "tab", order: 60 },
    { id: "communication", titleKey: "entityWorkspace.panels.communication", surface: "tab", order: 70 },
    { id: "tasks", titleKey: "entityWorkspace.panels.tasks", surface: "tab", order: 80 },
    { id: "forms", titleKey: "entityWorkspace.panels.forms", surface: "tab", order: 90, comingSoon: true },
    { id: "related-records", titleKey: "entityWorkspace.panels.relatedRecords", surface: "tab", order: 100 },
    { id: "bookings", titleKey: "entityWorkspace.panels.bookings", surface: "widget", order: 110 },
    { id: "tags", titleKey: "entityWorkspace.panels.tags", surface: "widget", order: 120 },
    { id: "custom-fields", titleKey: "entityWorkspace.panels.customFields", surface: "widget", order: 130 },
  ],
};

/** Extensibility stubs — same backend, different composition later. */
export const SUPPORT_ENTITY_LAYOUT: EntityWorkspaceLayoutDefinition = {
  moduleId: "support",
  titleKey: "entityWorkspace.layouts.support",
  defaultTab: "overview",
  hideCrmSalesWidgets: true,
  showOperationContext: false,
  panels: [
    { id: "overview", titleKey: "entityWorkspace.panels.overview", surface: "tab", order: 10 },
    { id: "communication", titleKey: "entityWorkspace.panels.communication", surface: "tab", order: 20 },
    { id: "notes", titleKey: "entityWorkspace.panels.notes", surface: "tab", order: 30 },
    { id: "attachments", titleKey: "entityWorkspace.panels.attachments", surface: "tab", order: 40 },
    { id: "timeline", titleKey: "entityWorkspace.panels.timeline", surface: "tab", order: 50 },
    { id: "tasks", titleKey: "entityWorkspace.panels.tasks", surface: "tab", order: 60, comingSoon: true },
  ],
};

export const HR_ENTITY_LAYOUT: EntityWorkspaceLayoutDefinition = {
  moduleId: "hr",
  entityTypes: ["employee"],
  titleKey: "entityWorkspace.layouts.hr",
  defaultTab: "overview",
  hideCrmSalesWidgets: true,
  showOperationContext: false,
  panels: [
    { id: "overview", titleKey: "entityWorkspace.panels.overview", surface: "tab", order: 10 },
    { id: "notes", titleKey: "entityWorkspace.panels.notes", surface: "tab", order: 20 },
    { id: "attachments", titleKey: "entityWorkspace.panels.attachments", surface: "tab", order: 30 },
    { id: "timeline", titleKey: "entityWorkspace.panels.timeline", surface: "tab", order: 40 },
    { id: "related-records", titleKey: "entityWorkspace.panels.relatedRecords", surface: "tab", order: 50 },
  ],
};

export const SALES_ENTITY_LAYOUT: EntityWorkspaceLayoutDefinition = {
  moduleId: "sales",
  entityTypes: ["customer", "lead", "company"],
  titleKey: "entityWorkspace.layouts.sales",
  defaultTab: "overview",
  hideCrmSalesWidgets: false,
  showOperationContext: false,
  panels: [
    { id: "overview", titleKey: "entityWorkspace.panels.overview", surface: "tab", order: 10 },
    { id: "lead-score", titleKey: "entityWorkspace.panels.leadScore", surface: "widget", order: 15 },
    { id: "deals", titleKey: "entityWorkspace.panels.deals", surface: "tab", order: 20, comingSoon: true },
    { id: "communication", titleKey: "entityWorkspace.panels.communication", surface: "tab", order: 30 },
    { id: "notes", titleKey: "entityWorkspace.panels.notes", surface: "tab", order: 40 },
    { id: "timeline", titleKey: "entityWorkspace.panels.timeline", surface: "tab", order: 50 },
  ],
};
