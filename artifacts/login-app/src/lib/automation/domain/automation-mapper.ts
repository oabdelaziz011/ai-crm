import type {
  AutomationAction,
  AutomationContext,
  AutomationExecution,
  AutomationGraph,
  AutomationHistory,
  AutomationSchedule,
  AutomationScheduleRecord,
  AutomationTrigger,
  AutomationWorkflow,
  ConditionGroup,
} from "@/lib/automation/types";

type WorkflowRow = {
  id: string;
  company_id: string;
  name: string;
  description: string;
  enabled: boolean;
  version: number;
  trigger: AutomationTrigger;
  conditions: ConditionGroup;
  actions: AutomationAction[];
  schedule: AutomationSchedule;
  graph: AutomationGraph;
  is_template: boolean;
  template_key: string | null;
  created_at: string;
  updated_at: string;
};

type ExecutionRow = {
  id: string;
  company_id: string;
  workflow_id: string;
  workflow_version: number;
  status: AutomationExecution["status"];
  trigger_event: string;
  context: AutomationContext;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
};

type HistoryRow = {
  id: string;
  execution_id: string;
  company_id: string;
  workflow_id: string;
  step_type: AutomationHistory["stepType"];
  step_index: number;
  status: AutomationHistory["status"];
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error: string | null;
  duration_ms: number;
  created_at: string;
};

type ScheduleRow = {
  id: string;
  company_id: string;
  execution_id: string;
  workflow_id: string;
  scheduled_at: string;
  delay_type: AutomationScheduleRecord["delayType"];
  delay_config: Record<string, unknown>;
  status: AutomationScheduleRecord["status"];
  created_at: string;
};

const EMPTY_CONDITION_GROUP: ConditionGroup = { operator: "and", conditions: [] };

export function mapWorkflowRow(row: WorkflowRow): AutomationWorkflow {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    version: row.version,
    trigger: row.trigger ?? { type: "system_event" },
    conditions: row.conditions ?? EMPTY_CONDITION_GROUP,
    actions: row.actions ?? [],
    schedule: row.schedule ?? { type: "immediate" },
    graph: row.graph ?? { nodes: [], edges: [] },
    isTemplate: row.is_template,
    templateKey: row.template_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapExecutionRow(row: ExecutionRow): AutomationExecution {
  return {
    id: row.id,
    companyId: row.company_id,
    workflowId: row.workflow_id,
    workflowVersion: row.workflow_version,
    status: row.status,
    triggerEvent: row.trigger_event,
    context: row.context ?? { companyId: row.company_id, eventName: row.trigger_event, params: {}, triggeredAt: row.created_at },
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    error: row.error,
    retryCount: row.retry_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapHistoryRow(row: HistoryRow): AutomationHistory {
  return {
    id: row.id,
    executionId: row.execution_id,
    companyId: row.company_id,
    workflowId: row.workflow_id,
    stepType: row.step_type,
    stepIndex: row.step_index,
    status: row.status,
    input: row.input ?? {},
    output: row.output ?? {},
    error: row.error,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}

export function mapScheduleRow(row: ScheduleRow): AutomationScheduleRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    executionId: row.execution_id,
    workflowId: row.workflow_id,
    scheduledAt: row.scheduled_at,
    delayType: row.delay_type,
    delayConfig: row.delay_config ?? {},
    status: row.status,
    createdAt: row.created_at,
  };
}

export function buildWorkflowGraph(workflow: Pick<AutomationWorkflow, "trigger" | "conditions" | "schedule" | "actions">): AutomationGraph {
  const nodes: AutomationGraph["nodes"] = [
    { id: "trigger", type: "trigger", label: workflow.trigger.type, position: { x: 0, y: 0 } },
    { id: "conditions", type: "condition", label: "conditions", position: { x: 200, y: 0 } },
    { id: "delay", type: "delay", label: workflow.schedule.type, position: { x: 400, y: 0 } },
  ];
  const edges: AutomationGraph["edges"] = [
    { id: "e-trigger-conditions", source: "trigger", target: "conditions" },
    { id: "e-conditions-delay", source: "conditions", target: "delay" },
  ];

  workflow.actions.forEach((action, index) => {
    const id = `action-${index}`;
    nodes.push({ id, type: "action", label: action.type, position: { x: 600 + index * 160, y: 0 } });
    edges.push({
      id: `e-delay-${id}`,
      source: index === 0 ? "delay" : `action-${index - 1}`,
      target: id,
    });
  });

  return { nodes, edges };
}

export function businessEventToContext(event: {
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
}): AutomationContext {
  return {
    companyId: event.companyId,
    eventName: event.name,
    params: event.params ?? {},
    userId: event.userId,
    branchId: event.branchId,
    customerId: event.customerId,
    customerTags: event.customerTags,
    bookingStatus: event.bookingStatus,
    resourceId: event.resourceId,
    priority: event.priority,
    appointmentAt: event.appointmentAt,
    triggeredAt: new Date().toISOString(),
  };
}
