import type { OperationsFieldType } from "../constants/field-types.js";
import type {
  OperationsAutomationConfig,
  OperationsCustomer360Config,
  OperationsDashboardConfig,
  OperationsDesignerConfig,
  OperationsFeatureFlagsConfig,
  OperationsFormsConfig,
  OperationsIntelligenceConfig,
  OperationsKanbanConfig,
  OperationsNotificationsConfig,
  OperationsPermissionsConfig,
  OperationsAiConfig,
  OperationsBusinessContextConfig,
  OperationsQueueRulesConfig,
  OperationsRoutingConfig,
  OperationsSlaConfig,
  OperationsCalendarViewConfig,
  OperationsTimelineConfig,
  OperationsViewsConfig,
} from "./extended-config-types.js";

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
  views: OperationsViewsConfig;
  permissions: OperationsPermissionsConfig;
  notifications: OperationsNotificationsConfig;
  ai: OperationsAiConfig;
  automation: OperationsAutomationConfig;
  dashboard: OperationsDashboardConfig;
  customer360: OperationsCustomer360Config;
  intelligence: OperationsIntelligenceConfig;
  businessContext: OperationsBusinessContextConfig;
  queueRules: OperationsQueueRulesConfig;
  sla: OperationsSlaConfig;
  designer: OperationsDesignerConfig;
  forms: OperationsFormsConfig;
  featureFlags: OperationsFeatureFlagsConfig;
  routing: OperationsRoutingConfig;
  kanban: OperationsKanbanConfig;
  calendar: OperationsCalendarViewConfig;
  timeline: OperationsTimelineConfig;
  updatedAt: string;
};

export type OperationsRoleLayout = {
  roleKey: string;
  roleLabel: string;
  visibleColumnIds: string[];
  allowedActions: string[];
};
