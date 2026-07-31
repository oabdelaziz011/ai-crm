import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AgentExecutionEngine } from "./agent-execution-engine.js";
import type { AgentWorkflowRepository } from "../checkpoint/checkpoint-service.js";
import { createInMemoryAgentWorkflowRepository } from "../checkpoint/in-memory-agent-workflow-repository.js";
import type { AgentRuntimePorts, AgentWorkflowRecord, ServiceContext } from "../types.js";
import { AGENT_PERMISSIONS } from "../constants.js";

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) =>
      code === AGENT_PERMISSIONS.view ||
      code === AGENT_PERMISSIONS.execute ||
      code === "tools.execute",
    ...overrides,
  };
}

function createRepoWithToolWorkflow(): AgentWorkflowRepository {
  const workflow: AgentWorkflowRecord = {
    id: "wf-1",
    company_id: "company-1",
    user_id: "user-1",
    conversation_id: "conv-1",
    goal: "Update customer phone",
    status: "running",
    task_graph: {
      workflowId: "wf-1",
      goal: "Update customer phone",
      agentType: "crm",
      nodes: [
        {
          id: "task_1",
          title: "Update phone",
          description: "Update customer phone field",
          tool: "update_customer",
          toolInput: { customerId: "cust-1", field: "phone", value: "+966501234567" },
          status: "pending",
          dependencies: [],
          retryCount: 0,
          maxRetries: 1,
        },
      ],
      edges: [],
    },
    memory: {
      goal: "Update customer phone",
      variables: {},
      completedTaskIds: [],
      pendingTaskIds: ["task_1"],
      toolOutputs: {},
      executionState: { agentType: "crm", progress: 0 },
    },
    correlation_id: "corr-1",
    checkpoint_index: 0,
    execution_lease_holder: null,
    execution_lease_expires_at: null,
    error_message: null,
    final_report: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
  };

  return createInMemoryAgentWorkflowRepository({ seeds: [workflow] }).repo;
}

describe("AgentExecutionEngine CRM tool pre-flight", () => {
  it("blocks tool execution when aligned CRM permission is missing", async () => {
    const ports: AgentRuntimePorts = {
      toolRouter: {
        async getRequiredPermissions() {
          return ["tools.execute", "customers.edit"];
        },
        route: async () => {
          throw new Error("route should not be called when pre-flight fails");
        },
      },
    };

    const engine = new AgentExecutionEngine(createRepoWithToolWorkflow(), ports);
    const result = await engine.resume(createContext(), "wf-1");

    assert.equal(result.status, "waiting_user");
    assert.match(result.taskGraph.nodes[0]?.error ?? "", /customers\.edit/);
  });

  it("allows legacy customers.update alias during pre-flight", async () => {
    let routed = false;
    const ports: AgentRuntimePorts = {
      toolRouter: {
        async getRequiredPermissions() {
          return ["tools.execute", "customers.edit"];
        },
        route: async () => {
          routed = true;
          return {
            executionId: "exec-1",
            status: "succeeded",
            output: { success: true, customerId: "cust-1" },
          };
        },
      },
    };

    const engine = new AgentExecutionEngine(createRepoWithToolWorkflow(), ports);
    await engine.resume(
      createContext({
        hasPermission: (code) =>
          code === AGENT_PERMISSIONS.view ||
          code === AGENT_PERMISSIONS.execute ||
          code === "tools.execute" ||
          code === "customers.update",
      }),
      "wf-1",
    );

    assert.equal(routed, true);
  });
});
