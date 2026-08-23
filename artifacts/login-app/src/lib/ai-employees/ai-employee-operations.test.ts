import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildExecutionQueue,
  buildOperationsSnapshot,
  buildRuntimeStatus,
  filterWorkflowsForEmployee,
  readAiEmployeeIdFromWorkflow,
} from "./selectors/operations-selectors.js";
import { mapAiEmployeeRow } from "./selectors/ai-employee-selectors.js";
import type { AgentWorkflowRecord } from "@workspace/agent-runtime";
import type { AiEmployeeDbRow } from "./types/ai-employee-types.js";

const employeeRow: AiEmployeeDbRow = {
  id: "agent-ops-1",
  company_id: "company-1",
  name: "ops-agent",
  display_name: "Ops Agent",
  description: "",
  avatar: null,
  department: null,
  owner_id: null,
  status: "published",
  provider: "openai",
  model: "gpt-4.1",
  temperature: 0.7,
  max_tokens: 4096,
  system_prompt: "Help users",
  system_prompt_summary: "Help users",
  welcome_message: "",
  knowledge_source_ids: ["kb-1"],
  knowledge_summary: "1 source",
  allowed_tool_keys: ["knowledge_lookup"],
  tool_summary: "knowledge_lookup",
  allowed_skill_ids: [],
  skills_summary: "No skills assigned",
  tags: [],
  created_at: "2026-08-01T08:00:00.000Z",
  updated_at: "2026-08-01T09:00:00.000Z",
  deleted_at: null,
  created_by: null,
  updated_by: null,
  prompt_version_label: "v1",
  runtime_configuration: {},
  published_version_id: "version-1",
  current_version_number: 1,
  has_unpublished_draft: false,
};

function workflow(partial: Partial<AgentWorkflowRecord> & Pick<AgentWorkflowRecord, "id">): AgentWorkflowRecord {
  return {
    company_id: "company-1",
    user_id: null,
    conversation_id: null,
    goal: "Test workflow",
    status: "running",
    task_graph: { workflowId: partial.id, goal: "Test workflow", nodes: [], edges: [] },
    memory: {
      goal: "Test workflow",
      variables: {},
      completedTaskIds: [],
      pendingTaskIds: [],
      toolOutputs: {},
      executionState: {
        pageContext: { aiEmployeeId: "agent-ops-1" },
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

describe("AiEmployee operations selectors", () => {
  it("reads ai employee id from workflow page context", () => {
    const record = workflow({ id: "wf-1" });
    assert.equal(readAiEmployeeIdFromWorkflow(record), "agent-ops-1");
  });

  it("filters workflows and builds runtime status", () => {
    const employee = mapAiEmployeeRow(employeeRow);
    const workflows = [
      workflow({ id: "wf-1", status: "running" }),
      workflow({
        id: "wf-2",
        status: "completed",
        memory: {
          goal: "Other",
          variables: {},
          completedTaskIds: [],
          pendingTaskIds: [],
          toolOutputs: {},
          executionState: { pageContext: { aiEmployeeId: "other-agent" } },
        },
      }),
    ];

    const filtered = filterWorkflowsForEmployee(workflows, employee.id);
    assert.equal(filtered.length, 1);

    const status = buildRuntimeStatus(employee, workflows, []);
    assert.equal(status.presence, "busy");
    assert.equal(status.queueLength, 0);
  });

  it("builds queue counts and operations snapshot", () => {
    const employee = mapAiEmployeeRow(employeeRow);
    const workflows = [
      workflow({ id: "wf-1", status: "running" }),
      workflow({ id: "wf-2", status: "completed" }),
      workflow({ id: "wf-3", status: "failed", error_message: "boom" }),
    ];

    const queue = buildExecutionQueue(filterWorkflowsForEmployee(workflows, employee.id));
    assert.equal(queue.running, 1);
    assert.equal(queue.completed, 1);
    assert.equal(queue.failed, 1);

    const snapshot = buildOperationsSnapshot({
      employee,
      workflows,
      events: [],
      toolExecutions: [],
      retrievalExecutions: [],
      usageRows: [],
      backgroundTasks: [],
    });

    assert.equal(snapshot.runningExecutions.length, 1);
    assert.equal(snapshot.errors.length, 1);
    assert.ok(snapshot.runtimeStatus.currentExecutionId);
  });
});
