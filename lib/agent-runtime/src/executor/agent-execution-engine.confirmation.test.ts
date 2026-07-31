import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENT_PERMISSIONS } from "../constants.js";
import { AgentExecutionEngine } from "./agent-execution-engine.js";
import type { AgentWorkflowRepository } from "../checkpoint/checkpoint-service.js";
import { createInMemoryAgentWorkflowRepository } from "../checkpoint/in-memory-agent-workflow-repository.js";
import type {
  AgentRuntimePorts,
  AgentTaskGraph,
  AgentWorkflowRecord,
  ServiceContext,
} from "../types.js";
import { createInitialMemory } from "../memory/agent-memory.js";
import { createTaskNode } from "../task-graph/task-graph.js";
import { isConfirmationInvalidated } from "../confirmation/confirmation-token.js";

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) =>
      code === AGENT_PERMISSIONS.view ||
      code === AGENT_PERMISSIONS.execute ||
      code === "tools.execute" ||
      code.startsWith("customers."),
    ...overrides,
  };
}

function createRepo(initial?: Partial<AgentWorkflowRecord>): {
  repo: AgentWorkflowRepository;
  getWorkflow: () => AgentWorkflowRecord | undefined;
} {
  const workflowId = initial?.id ?? "wf-confirm-1";
  const seed: AgentWorkflowRecord | undefined = initial?.task_graph
    ? {
        id: workflowId,
        company_id: "company-1",
        user_id: "user-1",
        conversation_id: "conv-1",
        goal: "Merge duplicate customers",
        status: "running",
        correlation_id: "corr-1",
        checkpoint_index: 0,
        execution_lease_holder: null,
        execution_lease_expires_at: null,
        error_message: null,
        final_report: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
        task_graph: initial.task_graph,
        memory: initial.memory!,
        ...initial,
      }
    : undefined;

  const { repo, workflows } = createInMemoryAgentWorkflowRepository({
    seeds: seed ? [seed] : undefined,
  });

  return {
    repo,
    getWorkflow: () => workflows.get(workflowId),
  };
}

function buildMergeGraph(): AgentTaskGraph {
  const workflowId = "wf-confirm-1";
  const node = createTaskNode({
    id: "merge-task",
    title: "Merge duplicates",
    description: "Merge duplicate customer records",
    tool: "merge_customers",
    toolInput: {
      primaryCustomerId: "cust-1",
      duplicateCustomerIds: ["cust-2"],
    },
    verificationRule: "merge_completed",
    status: "pending",
  });
  return {
    workflowId,
    goal: "Merge duplicate customers",
    agentType: "crm",
    nodes: [node],
    edges: [],
  };
}

describe("AgentExecutionEngine confirmation safety", () => {
  it("pauses before tool execution when confirmation is required", async () => {
    const graph = buildMergeGraph();
    const memory = createInitialMemory(graph.goal, graph);
    const { repo, getWorkflow } = createRepo({
      id: graph.workflowId,
      task_graph: graph,
      memory,
    });

    let routeCalls = 0;
    const ports: AgentRuntimePorts = {
      toolRouter: {
        route: async () => {
          routeCalls += 1;
          return {
            executionId: "exec-1",
            status: "succeeded",
            output: { success: true, merged: true },
          };
        },
      },
    };

    const engine = new AgentExecutionEngine(repo, ports);
    const result = await engine.runUntilBlocked(createContext(), graph.workflowId);

    assert.equal(routeCalls, 0);
    assert.equal(result.status, "waiting_user");
    assert.ok(result.confirmationRequest);
    assert.equal(result.confirmationRequest?.tool, "merge_customers");
    assert.equal(getWorkflow()?.task_graph.nodes[0]?.status, "waiting");
  });

  it("does not bypass confirmation when task input contains client confirmed=true", async () => {
    const graph = buildMergeGraph();
    graph.nodes[0].toolInput = {
      ...graph.nodes[0].toolInput,
      confirmed: true,
    };
    const memory = createInitialMemory(graph.goal, graph);
    const { repo } = createRepo({
      id: graph.workflowId,
      task_graph: graph,
      memory,
    });

    let routeCalls = 0;
    const ports: AgentRuntimePorts = {
      toolRouter: {
        route: async () => {
          routeCalls += 1;
          return {
            executionId: "exec-1",
            status: "succeeded",
            output: { success: true, merged: true },
          };
        },
      },
    };

    const engine = new AgentExecutionEngine(repo, ports);
    const result = await engine.runUntilBlocked(createContext(), graph.workflowId);

    assert.equal(routeCalls, 0);
    assert.equal(result.status, "waiting_user");
  });

  it("proceeds when runtime issued pre-start confirmation tokens", async () => {
    const { repo } = createRepo();

    const routedTools: string[] = [];
    const ports: AgentRuntimePorts = {
      toolRouter: {
        route: async (_ctx, input) => {
          routedTools.push(input.toolKey);
          if (input.toolKey === "merge_customers") {
            assert.equal(input.input.confirmed, true);
            assert.ok(input.input.confirmationToken);
            return {
              executionId: "exec-merge",
              status: "succeeded",
              output: { success: true, merged: true },
            };
          }
          return {
            executionId: "exec-read",
            status: "succeeded",
            output: { success: true, results: [{ id: "cust-1" }] },
          };
        },
      },
    };

    const engine = new AgentExecutionEngine(repo, ports);
    const result = await engine.start(createContext(), {
      companyId: "company-1",
      conversationId: "conv-1",
      goal: "Merge duplicate customers",
      preStartConfirmationAcknowledged: true,
    });

    assert.ok(routedTools.includes("merge_customers"));
    assert.equal(result.status, "completed");
  });

  it("resumes successfully with a valid confirmation token", async () => {
    const graph = buildMergeGraph();
    const memory = createInitialMemory(graph.goal, graph);
    const { repo } = createRepo({
      id: graph.workflowId,
      task_graph: graph,
      memory,
    });

    const ports: AgentRuntimePorts = {
      toolRouter: {
        route: async (_ctx, input) => {
          assert.equal(input.input.confirmed, true);
          assert.ok(input.input.confirmationToken);
          return {
            executionId: "exec-1",
            status: "succeeded",
            output: { success: true, merged: true },
          };
        },
      },
    };

    const engine = new AgentExecutionEngine(repo, ports);
    const paused = await engine.runUntilBlocked(createContext(), graph.workflowId);
    const token = paused.confirmationRequest?.confirmationToken;
    assert.ok(token);

    const resumed = await engine.resume(createContext(), {
      workflowId: graph.workflowId,
      confirmationToken: token,
    });

    assert.equal(resumed.status, "completed");
  });

  it("rejects expired confirmation tokens on resume", async () => {
    const graph = buildMergeGraph();
    const memory = createInitialMemory(graph.goal, graph);
    const { repo } = createRepo({
      id: graph.workflowId,
      task_graph: graph,
      memory,
    });

    const engine = new AgentExecutionEngine(repo, {
      toolRouter: { route: async () => ({ executionId: "x", status: "succeeded", output: {} }) },
    });
    const paused = await engine.runUntilBlocked(createContext(), graph.workflowId);
    const token = paused.confirmationRequest?.confirmationToken;
    assert.ok(token);

    const workflow = await repo.getWorkflow(graph.workflowId);
    assert.ok(workflow);
    const tokenStore = workflow.memory.executionState.confirmationTokens as Record<
      string,
      { expiresAt: string }
    >;
    tokenStore[token].expiresAt = "2020-01-01T00:00:00.000Z";
    await repo.updateWorkflow(graph.workflowId, { memory: workflow.memory });

    const resumed = await engine.resume(createContext(), {
      workflowId: graph.workflowId,
      confirmationToken: token,
    });

    assert.equal(resumed.status, "waiting_user");
    assert.match(resumed.taskGraph.nodes[0]?.error ?? "", /expired/i);
  });

  it("rejects duplicate token reuse (replay protection)", async () => {
    const graph = buildMergeGraph();
    const memory = createInitialMemory(graph.goal, graph);
    const { repo } = createRepo({
      id: graph.workflowId,
      task_graph: graph,
      memory,
    });

    const ports: AgentRuntimePorts = {
      toolRouter: {
        route: async () => ({
          executionId: "exec-1",
          status: "succeeded",
          output: { success: true, merged: true },
        }),
      },
    };

    const engine = new AgentExecutionEngine(repo, ports);
    const paused = await engine.runUntilBlocked(createContext(), graph.workflowId);
    const token = paused.confirmationRequest?.confirmationToken;
    assert.ok(token);

    await engine.resume(createContext(), {
      workflowId: graph.workflowId,
      confirmationToken: token,
    });

    const replayGraph = buildMergeGraph();
    replayGraph.nodes[0].status = "waiting";
    replayGraph.nodes[0].result = {
      confirmationRequired: true,
      confirmationRequest: paused.confirmationRequest,
    };
    await repo.updateWorkflow(graph.workflowId, {
      task_graph: replayGraph,
      status: "waiting_user",
    });

    const replay = await engine.resume(createContext(), {
      workflowId: graph.workflowId,
      confirmationToken: token,
    });

    assert.equal(replay.status, "waiting_user");
    assert.match(replay.taskGraph.nodes[0]?.error ?? "", /already been used/i);
  });

  it("rejects unauthorized confirmation from a different user", async () => {
    const graph = buildMergeGraph();
    const memory = createInitialMemory(graph.goal, graph);
    const { repo } = createRepo({
      id: graph.workflowId,
      task_graph: graph,
      memory,
    });

    const engine = new AgentExecutionEngine(repo, {
      toolRouter: { route: async () => ({ executionId: "x", status: "succeeded", output: {} }) },
    });
    const paused = await engine.runUntilBlocked(createContext(), graph.workflowId);
    const token = paused.confirmationRequest?.confirmationToken;
    assert.ok(token);

    const resumed = await engine.resume(createContext({ userId: "user-2" }), {
      workflowId: graph.workflowId,
      confirmationToken: token,
    });

    assert.equal(resumed.status, "waiting_user");
    assert.match(resumed.taskGraph.nodes[0]?.error ?? "", /not authorized/i);
  });

  it("invalidates confirmation tokens when workflow is cancelled", async () => {
    const graph = buildMergeGraph();
    const memory = createInitialMemory(graph.goal, graph);
    const { repo, getWorkflow } = createRepo({
      id: graph.workflowId,
      task_graph: graph,
      memory,
    });

    const engine = new AgentExecutionEngine(repo, {
      toolRouter: { route: async () => ({ executionId: "x", status: "succeeded", output: {} }) },
    });
    const paused = await engine.runUntilBlocked(createContext(), graph.workflowId);
    const token = paused.confirmationRequest?.confirmationToken;
    assert.ok(token);

    await engine.cancel(createContext(), graph.workflowId);

    const cancelled = getWorkflow();
    assert.ok(cancelled);
    assert.equal(cancelled.status, "cancelled");
    assert.equal(isConfirmationInvalidated(cancelled.memory), true);

    await assert.rejects(
      () =>
        engine.resume(createContext(), {
          workflowId: graph.workflowId,
          confirmationToken: token,
        }),
      /Cannot resume a cancelled workflow/,
    );
  });
});
