import type { OperationsFieldType } from "../constants/field-types.js";

export type OperationsColumnAlignment = "start" | "center" | "end";

export type OperationsColumnDefinition = {
  id: string;
  internalName: string;
  displayName: string;
  icon: string | null;
  type: OperationsFieldType;
  visible: boolean;
  required: boolean;
  sortable: boolean;
  filterable: boolean;
  searchable: boolean;
  exportable: boolean;
  reportable: boolean;
  aiIndexed: boolean;
  width: number;
  minWidth?: number;
  maxWidth?: number;
  alignment: OperationsColumnAlignment;
  defaultValue: string | number | boolean | null;
  validation: Record<string, unknown> | null;
  permissions: string[];
  position: number;
  pinned?: "left" | "right" | null;
};

export type OperationsStatusTransition = {
  fromStatusId: string;
  toStatusId: string;
  label?: string;
  permission?: string;
};

export type OperationsStatusDefinition = {
  id: string;
  internalName: string;
  displayName: string;
  color: string;
  icon: string | null;
  isTerminal: boolean;
  sortOrder: number;
  permissions: string[];
};

export type OperationsPaymentStatusDefinition = {
  id: string;
  internalName: string;
  displayName: string;
  color: string;
  sortOrder: number;
};

export type OperationsServiceDefinition = {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
  vatPercent: number;
  resourceIds: string[];
  color: string;
  capacity: number;
  onlineBooking: boolean;
  cancellationPolicy: string;
  bufferMinutes: number;
  active: boolean;
};

export type OperationsResourceDefinition = {
  id: string;
  name: string;
  type: string;
  branchId: string | null;
  color: string;
  active: boolean;
};

export type OperationsTerminology = Partial<
  Record<
    | "customer"
    | "resource"
    | "service"
    | "queue"
    | "payment"
    | "appointment"
    | "employee"
    | "branch",
    string
  >
>;

export type OperationsWorkspaceBranding = {
  accentColor: string;
  icon: string;
  moduleIcon: string;
};

export type OperationsWorkspaceConfig = {
  id: string;
  companyId: string;
  templateKey: string;
  workspaceName: string;
  moduleName: string;
  rowEntityName: string;
  terminology: OperationsTerminology;
  branding: OperationsWorkspaceBranding;
  columns: OperationsColumnDefinition[];
  statuses: OperationsStatusDefinition[];
  statusTransitions: OperationsStatusTransition[];
  paymentStatuses: OperationsPaymentStatusDefinition[];
  services: OperationsServiceDefinition[];
  resources: OperationsResourceDefinition[];
  updatedAt: string;
};

export type OperationsSavedView = {
  id: string;
  name: string;
  columnIds: string[];
  filters: Record<string, unknown>;
  sort: Array<{ columnId: string; direction: "asc" | "desc" }>;
  isDefault: boolean;
  isShared: boolean;
};

export type OperationsRoleLayout = {
  roleKey: string;
  roleLabel: string;
  visibleColumnIds: string[];
  allowedActions: string[];
};
