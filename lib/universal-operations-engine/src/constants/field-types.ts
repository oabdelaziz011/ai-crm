export const OPERATIONS_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "currency",
  "phone",
  "email",
  "address",
  "date",
  "time",
  "datetime",
  "boolean",
  "status",
  "payment",
  "lookup",
  "customer",
  "company",
  "employee",
  "branch",
  "resource",
  "dropdown",
  "multi_select",
  "tags",
  "rating",
  "color",
  "image",
  "attachment",
  "signature",
  "formula",
  "ai_generated",
] as const;

export type OperationsFieldType = (typeof OPERATIONS_FIELD_TYPES)[number];

export const OPERATIONS_MODULE_TABS = [
  "queue",
  "calendar",
  "kanban",
  "timeline",
  "configuration",
  "analytics",
] as const;

export type OperationsModuleTab = (typeof OPERATIONS_MODULE_TABS)[number];

export const OPERATIONS_PANEL_TABS = [
  "overview",
  "crm",
  "timeline",
  "bookings",
  "invoices",
  "payments",
  "activities",
  "files",
  "notes",
  "tasks",
  "ai_assistant",
] as const;

export type OperationsPanelTab = (typeof OPERATIONS_PANEL_TABS)[number];

export const OPERATIONS_CONFIG_TABS = [
  "general",
  "columns",
  "statuses",
  "payment_status",
  "services",
  "resources",
  "automation",
  "permissions",
  "views",
  "notifications",
  "integrations",
  "ai",
  "advanced",
] as const;

export type OperationsConfigTab = (typeof OPERATIONS_CONFIG_TABS)[number];

export const OPERATIONS_BUSINESS_TEMPLATES = [
  "clinic",
  "training_center",
  "automotive",
  "hr",
  "default",
] as const;

export type OperationsBusinessTemplate = (typeof OPERATIONS_BUSINESS_TEMPLATES)[number];
