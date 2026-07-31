import type { AgentWorkflowEventRecord, AgentWorkflowRecord } from "@workspace/agent-runtime";
import type { AiEmployeeChangeEventRecord } from "@/lib/ai-employees/types";
import type {
  AiEmployeeCollaborationAnalytics,
  AiEmployeeCollaborationPolicySnapshot,
  AiEmployeeCollaborationReadinessScore,
  AiEmployeeCollaborationSnapshot,
  AiEmployeeCollaborationTimelineEntry,
  AiEmployeeDirectoryEntry,
  AiEmployeeEscalationRecord,
  AiEmployeeGroupRecord,
  AiEmployeeHandoverRecord,
  AiEmployeeRecord,
  AiEmployeeSharedContextEntry,
  AiEmployeeSharedMemoryEntry,
} from "@/lib/ai-employees/types";
import type {
  CollaborationEventRow,
  CollaborationGroupRow,
  CollaborationHandoverRow,
  CollaborationPolicyRow,
} from "@/lib/ai-employees/repositories/ai-employee-collaboration-repository";
import type { AiEmployeeLongTermMemoryEntry } from "@/lib/ai-employees/types/memory-types";
import { filterWorkflowsForEmployee } from "@/lib/ai-employees/selectors/operations-selectors";

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function mapGroups(
  groups: CollaborationGroupRow[],
  members: Array<{ group_id: string; employee_id: string }>,
): AiEmployeeGroupRecord[] {
  const membersByGroup = new Map<string, string[]>();
  for (const member of members) {
    const list = membersByGroup.get(member.group_id) ?? [];
    list.push(member.employee_id);
    membersByGroup.set(member.group_id, list);
  }

  return groups.map((group) => ({
    id: group.id,
    key: group.key,
    name: group.name,
    displayName: group.display_name,
    description: group.description,
    department: group.department,
    tags: group.tags,
    memberIds: membersByGroup.get(group.id) ?? [],
    memberCount: membersByGroup.get(group.id)?.length ?? 0,
  }));
}

export function buildAgentDirectory(
  employees: AiEmployeeRecord[],
  groups: AiEmployeeGroupRecord[],
  operationsHealthById: Map<string, number>,
): AiEmployeeDirectoryEntry[] {
  const groupKeysByEmployee = new Map<string, string[]>();
  for (const group of groups) {
    for (const memberId of group.memberIds) {
      const keys = groupKeysByEmployee.get(memberId) ?? [];
      keys.push(group.key);
      groupKeysByEmployee.set(memberId, keys);
    }
  }

  return employees.map((employee) => ({
    employee,
    status: employee.status,
    department: employee.department,
    skillsSummary: employee.skillsSummary,
    toolSummary: employee.toolSummary,
    healthScore: operationsHealthById.get(employee.id) ?? estimateHealthFromStatus(employee.status),
    groupKeys: groupKeysByEmployee.get(employee.id) ?? [],
    capabilities: buildCapabilities(employee),
  }));
}

function estimateHealthFromStatus(status: AiEmployeeRecord["status"]): number {
  switch (status) {
    case "published":
      return 85;
    case "draft":
      return 50;
    case "disabled":
      return 30;
    case "archived":
      return 0;
    default:
      return 40;
  }
}

function buildCapabilities(employee: AiEmployeeRecord): string[] {
  const capabilities: string[] = [];
  if (employee.allowedToolKeys.length > 0) capabilities.push(`${employee.allowedToolKeys.length} tools`);
  if (employee.allowedSkillIds.length > 0) capabilities.push(`${employee.allowedSkillIds.length} skills`);
  if (employee.knowledgeSourceIds.length > 0) capabilities.push(`${employee.knowledgeSourceIds.length} knowledge`);
  if (employee.provider) capabilities.push(employee.provider);
  return capabilities;
}

export function mapHandovers(
  rows: CollaborationHandoverRow[],
  employeesById: Map<string, AiEmployeeRecord>,
): AiEmployeeHandoverRecord[] {
  return rows.map((row) => ({
    id: row.id,
    sourceEmployeeId: row.source_employee_id,
    sourceDisplayName: employeesById.get(row.source_employee_id)?.displayName ?? row.source_employee_id,
    destinationEmployeeId: row.destination_employee_id,
    destinationDisplayName:
      employeesById.get(row.destination_employee_id)?.displayName ?? row.destination_employee_id,
    reason: row.reason,
    status: row.status,
    escalationType: row.escalation_type,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }));
}

export function buildSharedContext(
  employee: AiEmployeeRecord,
  workflows: AgentWorkflowRecord[],
): AiEmployeeSharedContextEntry[] {
  const employeeWorkflows = filterWorkflowsForEmployee(workflows, employee.id);
  const latest = employeeWorkflows[0];
  if (!latest?.memory) return [];

  const entries: AiEmployeeSharedContextEntry[] = [];
  const variables = latest.memory.variables ?? {};
  for (const [key, value] of Object.entries(variables)) {
    entries.push({
      key,
      value: typeof value === "string" ? value : JSON.stringify(value),
      ownerEmployeeId: employee.id,
      ownerDisplayName: employee.displayName,
      scope: "session",
    });
  }

  const pageContext = latest.memory.executionState?.pageContext as Record<string, unknown> | undefined;
  if (pageContext) {
    for (const [key, value] of Object.entries(pageContext)) {
      if (key === "aiEmployeeId" || key === "aiEmployeeName") continue;
      entries.push({
        key,
        value: typeof value === "string" ? value : JSON.stringify(value),
        ownerEmployeeId: employee.id,
        ownerDisplayName: employee.displayName,
        scope: "workflow",
      });
    }
  }

  return entries;
}

export function buildSharedMemory(
  employee: AiEmployeeRecord,
  longTermEntries: AiEmployeeLongTermMemoryEntry[],
  collaboratorIds: string[],
  employeesById: Map<string, AiEmployeeRecord>,
): AiEmployeeSharedMemoryEntry[] {
  const shared: AiEmployeeSharedMemoryEntry[] = longTermEntries.map((entry) => ({
    ...entry,
    ownerEmployeeId: employee.id,
    ownerDisplayName: employee.displayName,
    scope: collaboratorIds.length > 0 ? "group" : "private",
    permissions: ["read"],
  }));

  for (const collaboratorId of collaboratorIds) {
    const collaborator = employeesById.get(collaboratorId);
    if (!collaborator) continue;
    shared.push({
      id: `collab-${collaboratorId}`,
      type: "fact",
      label: `${collaborator.displayName} collaboration context`,
      content: collaborator.skillsSummary,
      source: "collaboration",
      createdAt: collaborator.updatedAt,
      updatedAt: collaborator.updatedAt,
      ownerEmployeeId: collaboratorId,
      ownerDisplayName: collaborator.displayName,
      scope: "group",
      permissions: ["read"],
    });
  }

  return shared;
}

export function buildEscalations(
  handovers: AiEmployeeHandoverRecord[],
  humanEscalations: Array<{ id: string; state: string; updated_at: string }>,
): AiEmployeeEscalationRecord[] {
  const fromHandovers: AiEmployeeEscalationRecord[] = handovers
    .filter((handover) => handover.escalationType !== "ai_to_ai" || handover.status !== "cancelled")
    .map((handover) => ({
      id: handover.id,
      type: handover.escalationType,
      sourceLabel: handover.sourceDisplayName,
      destinationLabel: handover.destinationDisplayName,
      status: handover.status,
      timestamp: handover.createdAt,
    }));

  const fromConversations: AiEmployeeEscalationRecord[] = humanEscalations.map((row) => ({
    id: row.id,
    type: "ai_to_human" as const,
    sourceLabel: "AI Agent",
    destinationLabel: "Human Agent",
    status: row.state,
    timestamp: row.updated_at,
  }));

  return [...fromHandovers, ...fromConversations].sort(
    (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
  );
}

export function buildCollaborationTimeline(input: {
  collaborationEvents: CollaborationEventRow[];
  lifecycleEvents: AiEmployeeChangeEventRecord[];
  workflowEvents: AgentWorkflowEventRecord[];
  handovers: AiEmployeeHandoverRecord[];
}): AiEmployeeCollaborationTimelineEntry[] {
  const entries: AiEmployeeCollaborationTimelineEntry[] = [];

  for (const event of input.collaborationEvents) {
    entries.push({
      id: event.id,
      eventType: event.event_type,
      label: formatCollaborationEventLabel(event.event_type, event.metadata),
      timestamp: event.created_at,
      metadata: event.metadata,
    });
  }

  for (const event of input.lifecycleEvents) {
    entries.push({
      id: event.id,
      eventType: "lifecycle",
      label: `Lifecycle: ${event.eventType.replace(/_/g, " ")}`,
      timestamp: event.createdAt,
      metadata: event.metadata,
    });
  }

  for (const handover of input.handovers) {
    entries.push({
      id: `handover-${handover.id}`,
      eventType: "handover_requested",
      label: `Handover ${handover.sourceDisplayName} → ${handover.destinationDisplayName}`,
      timestamp: handover.createdAt,
      metadata: { status: handover.status, reason: handover.reason },
    });
  }

  for (const event of input.workflowEvents.slice(0, 20)) {
    entries.push({
      id: event.id,
      eventType: "workflow",
      label: `Workflow: ${event.event_type}`,
      timestamp: event.created_at,
      metadata: (event.payload as Record<string, unknown>) ?? {},
    });
  }

  return entries.sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
}

function formatCollaborationEventLabel(
  eventType: CollaborationEventRow["event_type"],
  metadata: Record<string, unknown>,
): string {
  const detail = typeof metadata.reason === "string" ? metadata.reason : "";
  return detail ? `${eventType.replace(/_/g, " ")} — ${detail}` : eventType.replace(/_/g, " ");
}

export function buildCollaborationAnalytics(handovers: AiEmployeeHandoverRecord[]): AiEmployeeCollaborationAnalytics {
  const completed = handovers.filter((handover) => handover.status === "completed");
  const failed = handovers.filter((handover) => handover.status === "failed");
  const successRate =
    handovers.length > 0 ? Math.round((completed.length / handovers.length) * 100) : 0;

  const completionDurations = completed
    .filter((handover) => handover.completedAt)
    .map(
      (handover) =>
        new Date(handover.completedAt!).getTime() - new Date(handover.createdAt).getTime(),
    );

  const averageCompletionMs =
    completionDurations.length > 0
      ? Math.round(completionDurations.reduce((sum, value) => sum + value, 0) / completionDurations.length)
      : 0;

  return {
    collaborationCount: handovers.length,
    handoverSuccessRate: successRate,
    averageCompletionMs,
    averageResponseMs: averageCompletionMs > 0 ? Math.round(averageCompletionMs * 0.3) : 0,
    failedTransfers: failed.length,
  };
}

export function mapCollaborationPolicy(row: CollaborationPolicyRow | null): AiEmployeeCollaborationPolicySnapshot {
  if (!row) {
    return {
      allowedCollaborations: [],
      blockedCollaborations: [],
      departmentRules: {},
      tenantRules: {},
    };
  }

  const departmentRules: Record<string, string[]> = {};
  for (const [department, value] of Object.entries(row.department_rules)) {
    departmentRules[department] = readStringArray(value);
  }

  return {
    allowedCollaborations: readStringArray(row.allowed_collaborations),
    blockedCollaborations: readStringArray(row.blocked_collaborations),
    departmentRules,
    tenantRules: row.tenant_rules,
  };
}

export function buildCollaborationReadiness(input: {
  employee: AiEmployeeRecord;
  groups: AiEmployeeGroupRecord[];
  policy: AiEmployeeCollaborationPolicySnapshot;
}): AiEmployeeCollaborationReadinessScore {
  const inGroup = input.groups.some((group) => group.memberIds.includes(input.employee.id));

  const categories: AiEmployeeCollaborationReadinessScore["categories"] = [
    {
      id: "skills",
      label: "Shared skills",
      ready: input.employee.allowedSkillIds.length > 0,
      missing: input.employee.allowedSkillIds.length === 0 ? ["No skills assigned"] : [],
    },
    {
      id: "permissions",
      label: "Permissions",
      ready: input.employee.allowedToolKeys.length > 0,
      missing: input.employee.allowedToolKeys.length === 0 ? ["No tool permissions"] : [],
    },
    {
      id: "knowledge",
      label: "Knowledge access",
      ready: input.employee.knowledgeSourceIds.length > 0,
      missing: input.employee.knowledgeSourceIds.length === 0 ? ["No knowledge sources"] : [],
    },
    {
      id: "memory",
      label: "Memory access",
      ready: input.employee.runtimeConfiguration.runtimeFlags.memoryMode !== "none",
      missing:
        input.employee.runtimeConfiguration.runtimeFlags.memoryMode === "none"
          ? ["Memory mode disabled"]
          : [],
    },
    {
      id: "lifecycle",
      label: "Lifecycle state",
      ready: input.employee.status === "published" && inGroup,
      missing: [
        ...(input.employee.status !== "published" ? [`Status is ${input.employee.status}`] : []),
        ...(!inGroup ? ["Not assigned to a collaboration group"] : []),
      ],
    },
  ];

  const readyCount = categories.filter((category) => category.ready).length;
  const score = Math.round((readyCount / categories.length) * 100);

  return {
    score,
    ready: score >= 80 && input.policy.allowedCollaborations.length > 0,
    categories,
  };
}

export function buildCollaborationSnapshot(input: {
  employee: AiEmployeeRecord;
  employees: AiEmployeeRecord[];
  groups: AiEmployeeGroupRecord[];
  handoverRows: CollaborationHandoverRow[];
  collaborationEvents: CollaborationEventRow[];
  lifecycleEvents: AiEmployeeChangeEventRecord[];
  workflowEvents: AgentWorkflowEventRecord[];
  workflows: AgentWorkflowRecord[];
  longTermMemory: AiEmployeeLongTermMemoryEntry[];
  humanEscalations: Array<{ id: string; state: string; updated_at: string }>;
  policy: CollaborationPolicyRow | null;
  operationsHealthById: Map<string, number>;
}): AiEmployeeCollaborationSnapshot {
  const employeesById = new Map(input.employees.map((entry) => [entry.id, entry]));
  const handovers = mapHandovers(input.handoverRows, employeesById);
  const policy = mapCollaborationPolicy(input.policy);

  const collaboratorIds = input.groups
    .filter((group) => group.memberIds.includes(input.employee.id))
    .flatMap((group) => group.memberIds)
    .filter((id) => id !== input.employee.id);

  return {
    directory: buildAgentDirectory(input.employees, input.groups, input.operationsHealthById),
    groups: input.groups,
    handovers,
    sharedContext: buildSharedContext(input.employee, input.workflows),
    sharedMemory: buildSharedMemory(input.employee, input.longTermMemory, collaboratorIds, employeesById),
    escalations: buildEscalations(handovers, input.humanEscalations),
    timeline: buildCollaborationTimeline({
      collaborationEvents: input.collaborationEvents,
      lifecycleEvents: input.lifecycleEvents,
      workflowEvents: input.workflowEvents,
      handovers,
    }),
    analytics: buildCollaborationAnalytics(handovers),
    policies: policy,
    readiness: buildCollaborationReadiness({ employee: input.employee, groups: input.groups, policy }),
  };
}

export function isCollaborationAllowed(
  policy: AiEmployeeCollaborationPolicySnapshot,
  sourceDepartment: string | null,
  destinationDepartment: string | null,
): boolean {
  const pair = `${sourceDepartment ?? "unknown"}:${destinationDepartment ?? "unknown"}`;
  if (policy.blockedCollaborations.some((blocked) => pair.includes(blocked))) {
    return false;
  }
  if (policy.allowedCollaborations.length === 0) return true;
  return policy.allowedCollaborations.some(
    (allowed) =>
      allowed.includes(sourceDepartment ?? "") || allowed.includes(destinationDepartment ?? ""),
  );
}
