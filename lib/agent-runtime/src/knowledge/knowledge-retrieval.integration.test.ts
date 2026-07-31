import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AgentKnowledgeContextBuilder,
  buildKnowledgeToolOutput,
  mapCitationsForToolOutput,
} from "./agent-knowledge-context-builder.js";
import { AgentKnowledgeRetrievalService } from "./knowledge-retrieval-service.js";
import { inferRetrievalQuery, resolveRetrievalPolicy } from "./retrieval-policy.js";
import type { AgentKnowledgeRetrievalResult } from "./retrieval-types.js";
import type { AgentTaskGraph, ServiceContext } from "../types.js";
import { AgentCrmToolPermissionDeniedError, AgentKnowledgeRetrievalError } from "../errors.js";
import { KNOWLEDGE_SEARCH_TOOL_KEY } from "./knowledge-retrieval-permissions.js";

function createContext(companyId = "company-1"): ServiceContext {
  return {
    userId: "user-1",
    companyId,
    isSuperAdmin: false,
    hasPermission: () => true,
  };
}

function createContextWithoutKnowledgeView(companyId = "company-1"): ServiceContext {
  return {
    userId: "user-1",
    companyId,
    isSuperAdmin: false,
    hasPermission: (code) => code !== "knowledge.view",
  };
}

function sampleGraph(overrides?: Partial<AgentTaskGraph>): AgentTaskGraph {
  return {
    workflowId: "wf-1",
    goal: "Search knowledge for onboarding policy",
    nodes: [
      {
        id: "k1",
        title: "Search knowledge base",
        description: "",
        tool: "knowledge_search",
        toolInput: { query: "onboarding" },
        status: "pending",
        dependencies: [],
        retryCount: 0,
        maxRetries: 2,
      },
    ],
    edges: [],
    retrievalPolicy: "required",
    ...overrides,
  };
}

function sampleResult(overrides?: Partial<AgentKnowledgeRetrievalResult>): AgentKnowledgeRetrievalResult {
  return {
    contextText: "[1] Onboarding Guide\nWelcome new customers.",
    citations: [
      {
        citationId: "cite-1",
        sourceId: "src-1",
        title: "Onboarding Guide",
        chunkId: "chunk-1",
        confidence: 0.91,
        score: 0.88,
        excerpt: "Welcome new customers.",
        sectionTitle: "Intro",
      },
    ],
    chunks: [
      {
        id: "chunk-1",
        content: "Welcome new customers.",
        title: "Onboarding Guide",
        sourceId: "src-1",
        chunkId: "chunk-1",
        confidence: 0.91,
        score: 0.88,
        tokenCount: 12,
      },
    ],
    confidence: 0.91,
    chunkCount: 1,
    totalTokens: 12,
    searchMode: "hybrid",
    executionId: "exec-1",
    vectorQueryExecutionId: "vq-1",
    ...overrides,
  };
}

describe("retrieval-policy", () => {
  it("resolves required policy for knowledge tasks", () => {
    assert.equal(resolveRetrievalPolicy(sampleGraph()), "required");
  });

  it("resolves disabled policy when no knowledge intent exists", () => {
    assert.equal(
      resolveRetrievalPolicy({
        workflowId: "wf-1",
        goal: "Create a customer",
        nodes: [],
        edges: [],
      }),
      "disabled",
    );
  });

  it("uses explicit planner policy when provided", () => {
    assert.equal(resolveRetrievalPolicy(sampleGraph({ retrievalPolicy: "optional" })), "optional");
  });

  it("prefers page context knowledge query override", () => {
    assert.equal(
      inferRetrievalQuery("fallback goal", { knowledgeQuery: "  refund policy  " }),
      "refund policy",
    );
  });
});

describe("AgentKnowledgeContextBuilder", () => {
  it("merges goal, retrieved documents, conversation, and memory", () => {
    const builder = new AgentKnowledgeContextBuilder();
    const context = builder.build({
      goal: "Explain onboarding",
      retrieval: sampleResult(),
      conversationHistory: ["What is onboarding?", "Need policy details."],
      memory: {
        goal: "Explain onboarding",
        variables: {},
        completedTaskIds: ["prep"],
        pendingTaskIds: [],
        toolOutputs: {},
        executionState: {},
      },
      maxTokens: 512,
    });

    assert.match(context.contextText, /User goal:/);
    assert.match(context.contextText, /Retrieved knowledge:/);
    assert.match(context.contextText, /Conversation history:/);
    assert.equal(context.citations.length, 1);
  });

  it("propagates citation metadata for tool output", () => {
    const output = buildKnowledgeToolOutput(sampleResult());
    assert.equal(output.citations[0]?.chunkId, "chunk-1");
    assert.equal(output.citations[0]?.source, "src-1");
    assert.equal(output.citations[0]?.title, "Onboarding Guide");
    assert.equal(output.citations[0]?.confidence, 0.91);
    assert.equal(Array.isArray(output.results), true);
  });

  it("maps citations with required fields", () => {
    const mapped = mapCitationsForToolOutput(sampleResult().citations);
    assert.deepEqual(Object.keys(mapped[0] ?? {}), ["source", "title", "chunkId", "confidence", "score", "excerpt"]);
  });
});

describe("AgentKnowledgeRetrievalService", () => {
  it("retrieves knowledge successfully for required policy", async () => {
    const service = new AgentKnowledgeRetrievalService();
    const { status, executionContext } = await service.retrieveForWorkflow(
      createContext(),
      {
        companyId: "company-1",
        goal: "Search knowledge for onboarding policy",
        taskGraph: sampleGraph(),
      },
      {
        retrieve: async () => sampleResult(),
      },
    );

    assert.equal(status.status, "success");
    assert.match(executionContext.contextText, /Onboarding Guide/);
  });

  it("returns empty status without failing optional retrieval", async () => {
    const service = new AgentKnowledgeRetrievalService();
    const { status } = await service.retrieveForWorkflow(
      createContext(),
      {
        companyId: "company-1",
        goal: "Optional knowledge lookup",
        taskGraph: sampleGraph({ retrievalPolicy: "optional" }),
      },
      {
        retrieve: async () => sampleResult({ chunkCount: 0, citations: [], chunks: [], contextText: "" }),
      },
    );

    assert.equal(status.status, "empty");
  });

  it("fails gracefully for required retrieval failures", async () => {
    const service = new AgentKnowledgeRetrievalService();
    await assert.rejects(
      () =>
        service.retrieveForWorkflow(
          createContext(),
          {
            companyId: "company-1",
            goal: "Required knowledge lookup",
            taskGraph: sampleGraph({ retrievalPolicy: "required" }),
          },
          {
            retrieve: async () => {
              throw new Error("vector store unavailable");
            },
          },
        ),
      AgentKnowledgeRetrievalError,
    );
  });

  it("continues when optional retrieval fails", async () => {
    const service = new AgentKnowledgeRetrievalService();
    const { status } = await service.retrieveForWorkflow(
      createContext(),
      {
        companyId: "company-1",
        goal: "Optional knowledge lookup",
        taskGraph: sampleGraph({ retrievalPolicy: "optional" }),
      },
      {
        retrieve: async () => {
          throw new Error("vector store unavailable");
        },
      },
    );

    assert.equal(status.status, "failed");
    if (status.status === "failed") {
      assert.equal(status.policy, "optional");
    }
  });

  it("enforces tenant isolation", async () => {
    const service = new AgentKnowledgeRetrievalService();
    await assert.rejects(
      () =>
        service.retrieveForWorkflow(
          createContext("company-1"),
          {
            companyId: "company-2",
            goal: "Cross tenant",
            taskGraph: sampleGraph(),
          },
          { retrieve: async () => sampleResult() },
        ),
      /Tenant isolation violation/,
    );
  });

  it("passes metadata filters to retrieval port", async () => {
    const service = new AgentKnowledgeRetrievalService();
    let receivedFilters: Record<string, unknown> | undefined;

    await service.retrieveForWorkflow(
      createContext(),
      {
        companyId: "company-1",
        goal: "Find legal policy",
        taskGraph: sampleGraph({ retrievalPolicy: "optional" }),
        pageContext: { knowledgeMetadataFilters: { department: "legal" } },
      },
      {
        retrieve: async (_ctx, input) => {
          receivedFilters = input.metadataFilters;
          return sampleResult();
        },
      },
    );

    assert.deepEqual(receivedFilters, { department: "legal" });
  });

  it("denies pre-workflow retrieval without knowledge.view", async () => {
    const service = new AgentKnowledgeRetrievalService();
    await assert.rejects(
      () =>
        service.retrieveForWorkflow(
          createContextWithoutKnowledgeView(),
          {
            companyId: "company-1",
            goal: "Search knowledge for onboarding policy",
            taskGraph: sampleGraph(),
          },
          { retrieve: async () => sampleResult() },
        ),
      (error: unknown) =>
        error instanceof AgentCrmToolPermissionDeniedError &&
        error.toolKey === KNOWLEDGE_SEARCH_TOOL_KEY &&
        error.permission === "knowledge.view",
    );
  });

  it("denies task retrieval without knowledge.view", async () => {
    const service = new AgentKnowledgeRetrievalService();
    await assert.rejects(
      () =>
        service.retrieveForTask(
          createContextWithoutKnowledgeView(),
          {
            companyId: "company-1",
            question: "onboarding policy",
          },
          { retrieve: async () => sampleResult() },
        ),
      (error: unknown) =>
        error instanceof AgentCrmToolPermissionDeniedError &&
        error.toolKey === KNOWLEDGE_SEARCH_TOOL_KEY &&
        error.permission === "knowledge.view",
    );
  });

  it("enforces permission parity between pre-workflow and task retrieval", async () => {
    const service = new AgentKnowledgeRetrievalService();
    const ctx = createContextWithoutKnowledgeView();
    const port = { retrieve: async () => sampleResult() };

    const workflowError = await service
      .retrieveForWorkflow(ctx, {
        companyId: "company-1",
        goal: "Search knowledge for onboarding policy",
        taskGraph: sampleGraph(),
      }, port)
      .then(() => null, (error: unknown) => error);

    const taskError = await service
      .retrieveForTask(ctx, { companyId: "company-1", question: "onboarding policy" }, port)
      .then(() => null, (error: unknown) => error);

    assert.ok(workflowError instanceof AgentCrmToolPermissionDeniedError);
    assert.ok(taskError instanceof AgentCrmToolPermissionDeniedError);
    assert.equal(workflowError.toolKey, taskError.toolKey);
    assert.equal(workflowError.permission, taskError.permission);
    assert.equal(workflowError.code, taskError.code);
  });
});
