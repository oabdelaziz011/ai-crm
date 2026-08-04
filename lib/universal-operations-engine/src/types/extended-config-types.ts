import type { Customer360SectionConfig } from "./customer360-types.js";
import type { IntelligenceBlockConfig, JourneyStepDefinition, WorkflowStageDefinition } from "./intelligence-types.js";

export type OperationsSavedView = {
  id: string;
  name: string;
  columnIds: string[];
  filters: Record<string, unknown>;
  sort: Array<{ columnId: string; direction: "asc" | "desc" }>;
  isDefault: boolean;
  isShared: boolean;
};

export type OperationsNotificationChannelConfig = {
  enabled: boolean;
  templateId?: string | null;
};

export type OperationsNotificationsConfig = {
  email: OperationsNotificationChannelConfig;
  sms: OperationsNotificationChannelConfig;
  whatsapp: OperationsNotificationChannelConfig;
  push: OperationsNotificationChannelConfig;
  quietHours?: { start: string; end: string } | null;
};

export type OperationsPermissionsConfig = {
  columns: Record<string, string[]>;
  statuses: Record<string, string[]>;
  actions: Record<string, string[]>;
};

export type OperationsCopilotCapabilityConfig = {
  id: string;
  labelKey: string;
  promptKey: string;
};

export type OperationsBusinessContextFieldConfig = {
  key: string;
  label: string;
  icon: string;
  valueBinding?: "customer.name" | "todaysOperation.assignedEmployee" | "static";
  staticValue?: string;
};

export type OperationsBusinessContextConfig = {
  fields: OperationsBusinessContextFieldConfig[];
  currentJourneyStepId?: string;
};

export type OperationsAiConfig = {
  copilotEnabled: boolean;
  suggestionsEnabled: boolean;
  knowledgeSourceIds: string[];
  allowedTools: string[];
  copilotCapabilities?: OperationsCopilotCapabilityConfig[];
  safetyPolicies: Record<string, unknown>;
};

export type OperationsDashboardWidgetConfig = {
  id: string;
  type: string;
  labelKey: string;
  visible: boolean;
  sortOrder: number;
  pinned?: boolean;
};

export type OperationsDashboardKpiConfig = {
  id: string;
  label: string;
  metricKey: string;
  visible: boolean;
};

export type OperationsDashboardChartConfig = {
  id: string;
  type: string;
  title: string;
  visible: boolean;
  config: Record<string, unknown>;
};

export type OperationsDashboardConfig = {
  widgets: OperationsDashboardWidgetConfig[];
  kpis: OperationsDashboardKpiConfig[];
  charts: OperationsDashboardChartConfig[];
};

export type OperationsAlertRuleConfig = {
  id: string;
  alertType: string;
  titleKey: string;
  messageKey: string;
  severity: "info" | "warning" | "critical";
  priority: "low" | "normal" | "high" | "urgent";
  color: string;
  icon: string;
  actionKey: string | null;
  enabled: boolean;
};

export type OperationsRecommendationRuleConfig = {
  id: string;
  labelKey: string;
  reasonKey: string;
  actionKey: string;
  enabled: boolean;
  minConfidence: number;
};

export type OperationsIntelligenceConfig = {
  blocks: IntelligenceBlockConfig[];
  workflowStages: WorkflowStageDefinition[];
  journeySteps: JourneyStepDefinition[];
  alertRules: OperationsAlertRuleConfig[];
  recommendationRules: OperationsRecommendationRuleConfig[];
};

export type OperationsCustomer360Config = {
  sections: Customer360SectionConfig[];
};

export type OperationsQueueRulesConfig = {
  defaultSort: Array<{ columnId: string; direction: "asc" | "desc" }>;
  defaultFilters: Record<string, unknown>;
  pageSize: number;
  maxWaitingMinutes?: number;
};

export type OperationsSlaRuleConfig = {
  id: string;
  name: string;
  thresholdMinutes: number;
  alertType: string;
  enabled: boolean;
};

export type OperationsSlaConfig = {
  rules: OperationsSlaRuleConfig[];
};

export type OperationsAutomationConfig = {
  linkedWorkflowTemplateIds: string[];
  enabledTriggerKeys: string[];
};

export type OperationsDesignerLayoutConfig = {
  id: string;
  name: string;
  blocks: Array<{ id: string; type: string; label: string; config: Record<string, unknown> }>;
};

export type OperationsDesignerConfig = {
  layouts: OperationsDesignerLayoutConfig[];
  activeLayoutId: string | null;
};

export type OperationsFormFieldConfig = {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
};

export type OperationsFormSchemaConfig = {
  id: string;
  name: string;
  entityType: string;
  fields: OperationsFormFieldConfig[];
};

export type OperationsFormsConfig = {
  schemas: OperationsFormSchemaConfig[];
};

export type OperationsRoutingRuleConfig = {
  id: string;
  name: string;
  condition: string;
  target: string;
  enabled: boolean;
};

export type OperationsRoutingConfig = {
  rules: OperationsRoutingRuleConfig[];
};

export type OperationsKanbanColumnConfig = {
  id: string;
  statusId: string;
  label: string;
  wipLimit?: number;
};

export type OperationsKanbanConfig = {
  columns: OperationsKanbanColumnConfig[];
  groupBy: "status" | "resource" | "priority";
};

export type OperationsCalendarViewConfig = {
  defaultView: "day" | "week" | "month";
  slotMinutes: number;
  showWeekends: boolean;
};

export type OperationsTimelineConfig = {
  groupBy: "status" | "date" | "resource";
  showAiEvents: boolean;
};

export type OperationsFeatureFlagsConfig = {
  flags: Record<string, boolean>;
};

export type OperationsViewsConfig = {
  savedViews: OperationsSavedView[];
  gridPreferences: {
    columnOrder: string[];
    hiddenColumnIds: string[];
    columnWidths: Record<string, number>;
    pinnedColumns: Record<string, "left" | "right" | null>;
    density: "compact" | "comfortable" | "spacious";
  };
};
