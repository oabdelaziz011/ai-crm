import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAgentDirectory,
  buildCollaborationAnalytics,
  buildCollaborationReadiness,
  buildCollaborationSnapshot,
  buildCollaborationTimeline,
  buildEscalations,
  buildSharedContext,
  isCollaborationAllowed,
  mapGroups,
  mapHandovers,
} from "./selectors/collaboration-selectors.js";
import { mapAiEmployeeRow } from "./selectors/ai-employee-selectors.js";
import type { AiEmployeeDbRow } from "./types/ai-employee-types.js";
import { DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION } from "./adapters/ai-employee-runtime-types.js";
import type { AgentWorkflowRecord } from "@workspace/agent-runtime";

const employeeRow: AiEmployeeDbRow = {
  id: "agent-collab-1",
  company_id: "company-1",
  name: "support-agent",
  display_name: "Support Agent",
  description: "Handles support",
  avatar: null,
  department: "Support",
  owner_id: null,
  status: "published",
  provider: "openai",
  model: "gpt-4.1",
  temperature: 0.7,
  max_tokens: 4096,
  system_prompt: "You are a support agent.",
  system_prompt_summary: "You are a support agent.",
  knowledge_source_ids: ["kb-1"],
  knowledge_summary: "1 source",
  allowed_tool_keys: ["knowledge_lookup"],
  tool_summary: "knowledge_lookup",
  allowed_skill_ids: ["skill-1"],
  skills_summary: "Support Skill",
  tags: [],
  created_at: "2026-08-01T08:00:00.000Z",
  updated_at: "2026-08-01T09:00:00.000Z",
  deleted_at: null,
  created_by: null,
  updated_by: null,
  prompt_version_label: "v1",
  runtime_configuration: DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION,
  published_version_id: "version-1",
  current_version_number: 1,
  has_unpublished_draft: false,
};

const salesRow: AiEmployeeDbRow = {
  ...employeeRow,
  id: "agent-collab-2",
  name: "sales-agent",
  display_name: "Sales Agent",
  department: "Sales",
};

function workflow(partial: Partial<AgentWorkflowRecord> & Pick<AgentWorkflowRecord, "id">): AgentWorkflowRecord {
  return {
    company_id: "company-1",
    user_id: null,
    conversation_id: "conv-1",
    goal: "Handle customer",
    status: "running",
    task_graph: { workflowId: partial.id, goal: "Handle customer", nodes: [], edges: [] },
    memory: {
      goal: "Handle customer",
      variables: { customerTier: "gold" },
      completedTaskIds: [],
      pendingTaskIds: [],
      toolOutputs: {},
      executionState: {
        pageContext: {
          aiEmployeeId: "agent-collab-1",
          handoverTarget: "agent-collab-2",
        },
      },
    },
    correlation_id: "corr-1",
    checkpoint_index: 0,
    execution_lease_holder: null,
    execution_lease_expires_at: null,
    error_message: null,
    final_report: null,
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:05:00.000Z",
    completed_at: null,
    ...partial,
  };
}

describe("AiEmployee collaboration selectors", () => {
  it("maps agent groups and directory entries", () => {
    const groups = mapGroups(
      [
        {
          id: "group-support",
          company_id: "company-1",
          key: "support",
          name: "support-team",
          display_name: "Support Team",
          description: "Support group",
          department: "Support",
          tags: [],
        },
      ],
      [{ group_id: "group-support", employee_id: "agent-collab-1" }],
    );

    assert.equal(groups[0]?.memberCount, 1);

    const employee = mapAiEmployeeRow(employeeRow);
    const directory = buildAgentDirectory([employee], groups, new Map([[employee.id, 90]]));
    assert.equal(directory[0]?.groupKeys[0], "support");
    assert.equal(directory[0]?.healthScore, 90);
  });

  it("builds shared context from workflow memory", () => {
    const employee = mapAiEmployeeRow(employeeRow);
    const context = buildSharedContext(employee, [workflow({ id: "wf-1" })]);
    assert.ok(context.some((entry) => entry.key === "customerTier"));
    assert.ok(context.some((entry) => entry.key === "handoverTarget"));
  });

  it("maps handovers and builds analytics", () => {
    const employees = new Map([
      ["agent-collab-1", mapAiEmployeeRow(employeeRow)],
      ["agent-collab-2", mapAiEmployeeRow(salesRow)],
    ]);

    const handovers = mapHandovers(
      [
        {
          id: "handover-1",
          company_id: "company-1",
          source_employee_id: "agent-collab-1",
          destination_employee_id: "agent-collab-2",
          reason: "Specialist required",
          status: "completed",
          escalation_type: "ai_to_ai",
          metadata: {},
          created_at: "2026-08-01T11:00:00.000Z",
          completed_at: "2026-08-01T11:05:00.000Z",
          created_by: null,
        },
      ],
      employees,
    );

    assert.equal(handovers[0]?.sourceDisplayName, "Support Agent");
    const analytics = buildCollaborationAnalytics(handovers);
    assert.equal(analytics.collaborationCount, 1);
    assert.equal(analytics.handoverSuccessRate, 100);
  });

  it("builds collaboration timeline and escalations", () => {
    const handovers = mapHandovers(
      [
        {
          id: "handover-2",
          company_id: "company-1",
          source_employee_id: "agent-collab-1",
          destination_employee_id: "agent-collab-2",
          reason: "Escalate",
          status: "pending",
          escalation_type: "ai_to_human",
          metadata: {},
          created_at: "2026-08-01T12:00:00.000Z",
          completed_at: null,
          created_by: null,
        },
      ],
      new Map([
        ["agent-collab-1", mapAiEmployeeRow(employeeRow)],
        ["agent-collab-2", mapAiEmployeeRow(salesRow)],
      ]),
    );

    const timeline = buildCollaborationTimeline({
      collaborationEvents: [
        {
          id: "event-1",
          company_id: "company-1",
          employee_id: "agent-collab-1",
          event_type: "handover_requested",
          metadata: { reason: "Escalate" },
          created_at: "2026-08-01T12:00:00.000Z",
          created_by: null,
        },
      ],
      lifecycleEvents: [],
      workflowEvents: [],
      handovers,
    });

    assert.ok(timeline.length >= 2);

    const escalations = buildEscalations(handovers, [
      { id: "conv-1", state: "transferred_to_human", updated_at: "2026-08-01T12:30:00.000Z" },
    ]);
    assert.ok(escalations.some((entry) => entry.type === "ai_to_human"));
  });

  it("evaluates collaboration policy and readiness", () => {
    const employee = mapAiEmployeeRow(employeeRow);
    const policy = {
      allowedCollaborations: ["Sales:Support"],
      blockedCollaborations: [],
      departmentRules: { Support: ["sales"] },
      tenantRules: {},
    };

    assert.equal(isCollaborationAllowed(policy, "Support", "Sales"), true);

    const readiness = buildCollaborationReadiness({
      employee,
      groups: [
        {
          id: "group-support",
          key: "support",
          name: "support-team",
          displayName: "Support Team",
          description: "",
          department: "Support",
          tags: [],
          memberIds: [employee.id],
          memberCount: 1,
        },
      ],
      policy,
    });

    assert.ok(readiness.score >= 60);

    const snapshot = buildCollaborationSnapshot({
      employee,
      employees: [employee],
      groups: [],
      handoverRows: [],
      collaborationEvents: [],
      lifecycleEvents: [],
      workflowEvents: [],
      workflows: [],
      longTermMemory: [],
      humanEscalations: [],
      policy: null,
      operationsHealthById: new Map([[employee.id, 85]]),
    });

    assert.equal(snapshot.directory.length, 1);
  });
});
