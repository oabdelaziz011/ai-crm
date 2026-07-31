import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMemorySnapshot,
  estimateTokens,
  filterMemoryEntries,
} from "./selectors/memory-selectors.js";
import { mapAiEmployeeRow } from "./selectors/ai-employee-selectors.js";
import type { AgentWorkflowRecord } from "@workspace/agent-runtime";
import type { AiEmployeeDbRow } from "./types/ai-employee-types.js";
import { DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION } from "./adapters/ai-employee-runtime-types.js";

const employeeRow: AiEmployeeDbRow = {
  id: "agent-memory-1",
  company_id: "company-1",
  name: "memory-agent",
  display_name: "Memory Agent",
  description: "",
  avatar: null,
  department: null,
  owner_id: null,
  status: "published",
  provider: "openai",
  model: "gpt-4.1",
  temperature: 0.7,
  max_tokens: 4096,
  system_prompt: "Remember customer preferences.",
  system_prompt_summary: "Remember customer preferences.",
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
  runtime_configuration: DEFAULT_AI_EMPLOYEE_RUNTIME_CONFIGURATION,
  published_version_id: "version-1",
  current_version_number: 1,
  has_unpublished_draft: false,
};

function workflow(partial: Partial<AgentWorkflowRecord> & Pick<AgentWorkflowRecord, "id">): AgentWorkflowRecord {
  return {
    company_id: "company-1",
    user_id: null,
    conversation_id: "conv-1",
    goal: "Remember user preference",
    status: "running",
    task_graph: { workflowId: partial.id, goal: "Remember user preference", nodes: [], edges: [] },
    memory: {
      goal: "Remember user preference",
      variables: { customerTier: "gold" },
      completedTaskIds: ["task-1"],
      pendingTaskIds: [],
      toolOutputs: { "task-1": { summary: "Preferred email contact" } },
      executionState: { pageContext: { aiEmployeeId: "agent-memory-1" } },
    },
    correlation_id: "corr-1",
    checkpoint_index: 1,
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

describe("AiEmployee memory selectors", () => {
  it("estimates token counts from text", () => {
    assert.ok(estimateTokens("hello world") >= 2);
  });

  it("builds memory snapshot from workflow and checkpoint data", () => {
    const employee = mapAiEmployeeRow(employeeRow);
    const snapshot = buildMemorySnapshot({
      employee,
      previewPrompt: employee.systemPrompt,
      workflows: [workflow({ id: "wf-1" })],
      events: [],
      checkpoints: [
        {
          id: "cp-1",
          workflow_id: "wf-1",
          checkpoint_index: 1,
          snapshot: { variables: { customerTier: "gold" } },
          created_at: "2026-08-01T10:01:00.000Z",
        },
      ],
      retrievalContexts: [{ id: "ctx-1", execution_id: "re-1", chunk_count: 3, total_tokens: 120, created_at: "2026-08-01T10:02:00.000Z", metadata: {} }],
      retrievalExecutions: [{ id: "re-1", execution_status: "completed", execution_time_ms: 45, created_at: "2026-08-01T10:02:00.000Z", metadata: {} }],
      messages: [{ id: "m-1", conversation_id: "conv-1", messageType: "incoming", content: "Hello", created_at: "2026-08-01T10:00:00.000Z" }],
    });

    assert.equal(snapshot.shortTerm.activeVariables[0]?.key, "customerTier");
    assert.ok(snapshot.longTerm.length > 0);
    assert.ok(snapshot.contextWindow.estimatedTokens > 0);
    assert.ok(snapshot.timeline.length > 0);
    assert.equal(snapshot.policies.memoryMode, "session");
  });

  it("filters memory entries by keyword and type", () => {
    const entries = [
      {
        id: "1",
        type: "variable" as const,
        label: "customerTier",
        content: "gold",
        source: "workflow_memory",
        createdAt: "2026-08-01T10:00:00.000Z",
        updatedAt: "2026-08-01T10:00:00.000Z",
      },
      {
        id: "2",
        type: "checkpoint" as const,
        label: "Checkpoint",
        content: "snapshot",
        source: "agent_workflow_checkpoints",
        createdAt: "2026-08-01T10:01:00.000Z",
        updatedAt: "2026-08-01T10:01:00.000Z",
      },
    ];

    assert.equal(filterMemoryEntries(entries, { keyword: "gold" }).length, 1);
    assert.equal(filterMemoryEntries(entries, { type: "checkpoint" }).length, 1);
  });
});
