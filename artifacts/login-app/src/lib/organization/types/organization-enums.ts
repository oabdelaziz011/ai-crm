export type HierarchyLevel = "organization" | "region" | "branch_group" | "branch" | "department";

export type ResourceType = "doctor" | "room" | "equipment" | "staff";

export type AssignmentType = "permanent" | "temporary" | "shared";

export type MaintenanceStatus = "operational" | "maintenance" | "offline";

export type PolicyType =
  | "working_hours"
  | "cancellation"
  | "no_show"
  | "pricing"
  | "tax"
  | "communication"
  | "portal_branding"
  | "notifications"
  | "capacity";

export type PolicyScopeLevel = "organization" | "region" | "branch_group" | "branch";

export type TransferType = "booking" | "doctor" | "equipment" | "room" | "staff";

export type TransferStatus = "pending" | "approved" | "rejected" | "completed" | "rolled_back" | "cancelled";

export type OrganizationRole =
  | "owner"
  | "executive"
  | "regional_manager"
  | "branch_manager"
  | "department_manager"
  | "staff";

export type DepartmentType = "general" | "clinical" | "administrative" | "support";

export type SearchResultType = "branch" | "region" | "customer" | "doctor" | "booking" | "invoice" | "resource";
