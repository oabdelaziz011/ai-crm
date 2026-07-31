import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENT_PERMISSIONS } from "../constants.js";
import { AgentExecutionEngine } from "../executor/agent-execution-engine.js";
import { createInMemoryAgentWorkflowRepository } from "../checkpoint/in-memory-agent-workflow-repository.js";
import { AgentCrmToolPermissionDeniedError, AgentKnowledgeRetrievalError } from "../errors.js";
import { KNOWLEDGE_SEARCH_TOOL_KEY } from "../knowledge/knowledge-retrieval-permissions.js";
import { createInitialMemory } from "../memory/agent-memory.js";
import type { AgentRuntimePorts, AgentTaskGraph, AgentWorkflowRecord, ServiceContext } from "../types.js";
import type { AgentKnowledgeRetrievalResult } from "../knowledge/retrieval-types.js";
function createContext(): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) =>
      code === AGENT_PERMISSIONS.view ||
      code === AGENT_PERMISSIONS.execute ||
      code === "tools.execute" ||
      code === "knowledge.view",
  };
}

function createContextWithoutKnowledgeView(): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) =>
      code === AGENT_PERMISSIONS.view ||
      code === AGENT_PERMISSIONS.execute ||
      code === "tools.execute",
  };
}
function sampleResult(): AgentKnowledgeRetrievalResult {
  return {
    contextText: "[1] Policy Handbook\nEmployees must complete onboarding.",
    citations: [
      {
        citationId: "cite-1",
        sourceId: "src-policy",
        title: "Policy Handbook",
        chunkId: "chunk-88",
        confidence: 0.95,
        score: 0.92,
        excerpt: "Employees must complete onboarding.",
      },
    ],
    chunks: [
      {
        id: "chunk-88",
        content: "Employees must complete onboarding.",
        title: "Policy Handbook",
        sourceId: "src-policy",
        chunkId: "chunk-88",
        confidence: 0.95,
        score: 0.92,
        tokenCount: 10,
      },
    ],
    confidence: 0.95,
    chunkCount: 1,
    totalTokens: 10,
    searchMode: "hybrid",
    executionId: "exec-knowledge-1",
    vectorQueryExecutionId: "vq-1",
  };
}

describe("AgentExecutionEngine knowledge integration", () => {
  it("injects retrieved knowledge into workflow memory during start", async () => {
    const { repo } = createInMemoryAgentWorkflowRepository();
    let retrieveCalls = 0;

    const ports: AgentRuntimePorts = {
      toolRouter: {
        route: async () => ({ executionId: "x", status: "succeeded", output: {} }),
      },
      knowledgeRetrieval: {
        retrieve: async () => {
          retrieveCalls += 1;
          return sampleResult();
        },
      },
    };

    const engine = new AgentExecutionEngine(repo, ports);
    const result = await engine.start(createContext(), {
      companyId: "company-1",
      conversationId: "conv-1",
      goal: "Search knowledge for onboarding policy",
    });

    const workflow = await repo.getWorkflow(result.workflowId);
    assert.equal(retrieveCalls >= 1, true);
    assert.match(String(workflow?.memory.executionState.knowledgeContext ?? ""), /Policy Handbook/);
    assert.equal(Array.isArray(workflow?.memory.executionState.knowledgeCitations), true);
  });

  it("executes knowledge_search via retrieval port and propagates citations", async () => {
    const { repo } = createInMemoryAgentWorkflowRepository();
    const ports: AgentRuntimePorts = {
      toolRouter: {
        route: async () => {
          throw new Error("tool router should not be used for knowledge_search when retrieval port is configured");
        },
        getRequiredPermissions: async () => ["tools.execute", "knowledge.view"],
      },
      knowledgeRetrieval: {
        retrieve: async () => sampleResult(),
      },
    };

    const engine = new AgentExecutionEngine(repo, ports);
    const result = await engine.start(createContext(), {
      companyId: "company-1",
      conversationId: "conv-1",
      goal: "Search knowledge for onboarding policy",
    });

    const knowledgeTask = result.taskGraph.nodes.find((node) => node.tool === "knowledge_search");
    assert.ok(knowledgeTask);
    assert.equal(knowledgeTask?.status, "verified");

    const workflow = await repo.getWorkflow(result.workflowId);
    const output = workflow?.memory.toolOutputs[knowledgeTask!.id] as Record<string, unknown> | undefined;
    const citations = output?.citations as Array<Record<string, unknown>> | undefined;
    assert.equal(citations?.[0]?.chunkId, "chunk-88");
    assert.equal(citations?.[0]?.title, "Policy Handbook");
  });

  it("fails workflow startup when required retrieval port is unavailable", async () => {
    const { repo } = createInMemoryAgentWorkflowRepository();
    const ports: AgentRuntimePorts = {
      toolRouter: {
        route: async () => ({ executionId: "x", status: "succeeded", output: {} }),
      },
    };

    const engine = new AgentExecutionEngine(repo, ports);
    await assert.rejects(
      () =>
        engine.start(createContext(), {
          companyId: "company-1",
          conversationId: "conv-1",
          goal: "Search knowledge for onboarding policy",
        }),
      (error: unknown) =>
        error instanceof AgentKnowledgeRetrievalError &&
        error.retrievalCode === "KNOWLEDGE_RETRIEVAL_UNAVAILABLE",
    );
  });

  it("denies pre-workflow retrieval without knowledge.view", async () => {
    const { repo } = createInMemoryAgentWorkflowRepository();
    const ports: AgentRuntimePorts = {
      toolRouter: {
        route: async () => ({ executionId: "x", status: "succeeded", output: {} }),
        getRequiredPermissions: async () => ["tools.execute", "knowledge.view"],
      },
      knowledgeRetrieval: {
        retrieve: async () => sampleResult(),
      },
    };

    const engine = new AgentExecutionEngine(repo, ports);
    await assert.rejects(
      () =>
        engine.start(createContextWithoutKnowledgeView(), {
          companyId: "company-1",
          conversationId: "conv-1",
          goal: "Search knowledge for onboarding policy",
        }),
      (error: unknown) =>
        error instanceof AgentCrmToolPermissionDeniedError &&
        error.toolKey === KNOWLEDGE_SEARCH_TOOL_KEY &&
        error.permission === "knowledge.view",
    );
  });

  it("denies knowledge_search task execution without knowledge.view", async () => {
    const workflowId = "wf-knowledge-task-perm";
    const graph: AgentTaskGraph = {
      workflowId,
      goal: "Create customer",
      retrievalPolicy: "disabled",
      nodes: [
        {
          id: "k1",
          title: "Search knowledge base",
          description: "",
          tool: "knowledge_search",
          toolInput: { query: "onboarding policy" },
          status: "pending",
          dependencies: [],
          retryCount: 0,
          maxRetries: 2,
        },
      ],
      edges: [],
    };

    const workflow: AgentWorkflowRecord = {
      id: workflowId,
      company_id: "company-1",
      user_id: "user-1",
      conversation_id: "conv-1",
      goal: graph.goal,
      status: "running",
      task_graph: graph,
      memory: createInitialMemory(graph.goal, graph),
      correlation_id: "corr-knowledge-perm",
      checkpoint_index: 0,
      execution_lease_holder: null,
      execution_lease_expires_at: null,
      error_message: null,
      final_report: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    };

    let retrieveCalls = 0;
    const { repo } = createInMemoryAgentWorkflowRepository({ seeds: [workflow] });
    const ports: AgentRuntimePorts = {
      toolRouter: {
        route: async () => ({ executionId: "x", status: "succeeded", output: {} }),
        getRequiredPermissions: async () => ["tools.execute", "knowledge.view"],
      },
      knowledgeRetrieval: {
        retrieve: async () => {
          retrieveCalls += 1;
          return sampleResult();
        },
      },
    };

    const engine = new AgentExecutionEngine(repo, ports);
    const result = await engine.recover(createContextWithoutKnowledgeView(), workflowId);
    const knowledgeTask = result.taskGraph.nodes.find((node) => node.tool === "knowledge_search");

    assert.equal(knowledgeTask?.status, "failed");
    assert.match(String(knowledgeTask?.error ?? ""), /knowledge\.view/);
    assert.equal(retrieveCalls, 0);
  });
});