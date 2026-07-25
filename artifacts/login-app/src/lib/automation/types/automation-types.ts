import type {
  AutomationActionType,
  AutomationConditionField,
  AutomationConditionOperator,
  AutomationDelayType,
  AutomationHistoryStepType,
  AutomationScheduleStatus,
  AutomationStatus,
  AutomationTriggerType,
} from "@/lib/automation/types/automation-enums";
import type { NotificationChannel, NotificationEvent, NotificationPriority } from "@/lib/notifications/types";

export type AutomationTrigger = {
  type: AutomationTriggerType;
  customEventName?: string;
};

export type AutomationCondition = {
  field: AutomationConditionField;
  operator: AutomationConditionOperator;
  value: string | string[] | { from?: string; to?: string };
};

export type ConditionGroup = {
  operator: "and" | "or";
  conditions: Array<AutomationCondition | ConditionGroup>;
};

export type AutomationAction = {
  type: AutomationActionType;
  event?: NotificationEvent;
  channels?: NotificationChannel[];
  priority?: NotificationPriority;
  params?: Record<string, string>;
  enabled?: boolean;
};

export type AutomationSchedule = {
  type: AutomationDelayType;
  minutes?: number;
  hours?: number;
  days?: number;
  beforeMinutes?: number;
  atTime?: string;
};

export type AutomationGraphNode = {
  id: string;
  type: "trigger" | "condition" | "delay" | "action";
  label: string;
  position: { x: number; y: number };
};

export type AutomationGraphEdge = {
  id: string;
  source: string;
  target: string;
};

export type AutomationGraph = {
  nodes: AutomationGraphNode[];
  edges: AutomationGraphEdge[];
};

export type AutomationWorkflow = {
  id: string;
  companyId: string;
  name: string;
  description: string;
  enabled: boolean;
  version: number;
  trigger: AutomationTrigger;
  conditions: ConditionGroup;
  actions: AutomationAction[];
  schedule: AutomationSchedule;
  graph: AutomationGraph;
  isTemplate: boolean;
  templateKey: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AutomationContext = {
  companyId: string;
  eventName: string;
  params: Record<string, string>;
  userId?: string | null;
  branchId?: string | null;
  customerId?: string | null;
  customerTags?: string[];
  bookingStatus?: string | null;
  resourceId?: string | null;
  priority?: string | null;
  appointmentAt?: string | null;
  triggeredAt: string;
};

export type AutomationExecution = {
  id: string;
  companyId: string;
  workflowId: string;
  workflowVersion: number;
  status: AutomationStatus;
  triggerEvent: string;
  context: AutomationContext;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AutomationHistory = {
  id: string;
  executionId: string;
  companyId: string;
  workflowId: string;
  stepType: AutomationHistoryStepType;
  stepIndex: number;
  status: "completed" | "failed" | "skipped";
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error: string | null;
  durationMs: number;
  createdAt: string;
};

export type AutomationScheduleRecord = {
  id: string;
  companyId: string;
  executionId: string;
  workflowId: string;
  scheduledAt: string;
  delayType: AutomationDelayType;
  delayConfig: Record<string, unknown>;
  status: AutomationScheduleStatus;
  createdAt: string;
};

export type AutomationWorkflowInput = {
  name: string;
  description?: string;
  trigger: AutomationTrigger;
  conditions?: ConditionGroup;
  actions: AutomationAction[];
  schedule?: AutomationSchedule;
  graph?: AutomationGraph;
};

export type AutomationExecutionPage = {
  items: AutomationExecution[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type AutomationBusinessEvent = {
  name: string;
  companyId: string;
  params?: Record<string, string>;
  userId?: string | null;
  branchId?: string | null;
  customerId?: string | null;
  customerTags?: string[];
  bookingStatus?: string | null;
  resourceId?: string | null;
  priority?: string | null;
  appointmentAt?: string | null;
};

export type ExecutionPlan = {
  workflow: AutomationWorkflow;
  context: AutomationContext;
  scheduledAt: string | null;
  shouldSchedule: boolean;
};

export type AutomationEngineResult = {
  executionsCreated: number;
  scheduled: number;
  completed: number;
  failed: number;
  executionIds: string[];
};
