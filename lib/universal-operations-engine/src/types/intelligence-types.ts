import type { Customer360WorkspaceRole } from "./customer360-types.js";

export type IntelligenceBlockId =
  | "context_ribbon"
  | "workflow_tracker"
  | "operational_intelligence"
  | "alerts"
  | "recommendations"
  | "quick_decision_bar"
  | "business_context"
  | "mini_kpis"
  | "floating_copilot";

export type IntelligenceBlockConfig = {
  id: IntelligenceBlockId;
  visible: boolean;
  collapsed: boolean;
  sortOrder: number;
  roles: Customer360WorkspaceRole[];
  permissions: string[];
};

export const DEFAULT_INTELLIGENCE_BLOCKS: IntelligenceBlockConfig[] = [
  { id: "context_ribbon", visible: true, collapsed: false, sortOrder: 0, roles: ["receptionist", "nurse", "cashier", "manager"], permissions: [] },
  { id: "quick_decision_bar", visible: true, collapsed: false, sortOrder: 1, roles: ["receptionist", "cashier", "nurse", "manager"], permissions: [] },
  { id: "operational_intelligence", visible: true, collapsed: false, sortOrder: 2, roles: ["receptionist", "manager"], permissions: [] },
  { id: "alerts", visible: true, collapsed: false, sortOrder: 3, roles: ["receptionist", "nurse", "cashier", "manager"], permissions: [] },
  { id: "recommendations", visible: true, collapsed: false, sortOrder: 4, roles: ["receptionist", "nurse", "manager"], permissions: [] },
  { id: "workflow_tracker", visible: true, collapsed: false, sortOrder: 5, roles: ["receptionist", "nurse", "manager"], permissions: [] },
  { id: "mini_kpis", visible: true, collapsed: false, sortOrder: 6, roles: ["receptionist", "cashier", "manager"], permissions: [] },
  { id: "business_context", visible: true, collapsed: false, sortOrder: 7, roles: ["nurse", "manager"], permissions: [] },
  { id: "floating_copilot", visible: true, collapsed: false, sortOrder: 8, roles: ["receptionist", "cashier", "nurse", "manager"], permissions: [] },
];

export type JourneyStepDefinition = {
  id: string;
  labelKey: string;
  icon: string;
};

export type JourneyStepState = {
  id: string;
  label: string;
  icon: string;
  status: "completed" | "current" | "upcoming";
};

export type WorkflowStageDefinition = {
  id: string;
  labelKey: string;
  sortOrder: number;
};

export type WorkflowStageState = {
  id: string;
  label: string;
  state: "done" | "active" | "pending";
};

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertPriority = "low" | "normal" | "high" | "urgent";

export type OperationalAlert = {
  id: string;
  alertType: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  priority: AlertPriority;
  color: string;
  icon: string;
  actionKey: string | null;
};

export type IntelligenceRecommendation = {
  id: string;
  title: string;
  reason: string;
  confidence: number;
  actionKey: string;
  labelKey: string;
};

export type OperationalHealthMetric = {
  id: string;
  labelKey: string;
  value: string | number;
  trend?: string;
  tone?: "default" | "success" | "warning" | "danger";
};

export type QuickDecisionSnapshot = {
  outstandingPaymentCents: number;
  currentStatus: string;
  assignedEmployee: string;
  room: string;
  resource: string;
  priority: string;
  risk: string;
  nextAction: string;
  nextActionKey: string;
};

export type BusinessContextField = {
  key: string;
  label: string;
  value: string;
  icon: string;
};

export type MiniKpiCard = {
  id: string;
  labelKey: string;
  value: string;
  trend: string;
  trendDirection: "up" | "down" | "flat";
};

export type CopilotCapability = {
  id: string;
  labelKey: string;
  promptKey: string;
};

export type IntelligenceSnapshot = {
  journey: JourneyStepState[];
  workflow: WorkflowStageState[];
  alerts: OperationalAlert[];
  recommendations: IntelligenceRecommendation[];
  operationalHealth: OperationalHealthMetric[];
  quickDecision: QuickDecisionSnapshot;
  businessContext: BusinessContextField[];
  miniKpis: MiniKpiCard[];
  copilotCapabilities: CopilotCapability[];
  communicationGroups: Array<{ dateLabel: string; items: Array<{ id: string; channel: string; preview: string; occurredAt: string; actor: string }> }>;
};

export function resolveIntelligenceBlocks(
  blocks: IntelligenceBlockConfig[],
  role: Customer360WorkspaceRole,
): IntelligenceBlockConfig[] {
  return blocks.filter((b) => b.visible && b.roles.includes(role)).sort((a, b) => a.sortOrder - b.sortOrder);
}
