import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AgentsFeatureDisabledError } from "../errors.js";
import { AgentExecutionEngine } from "./agent-execution-engine.js";
import type { AgentWorkflowRepository } from "../checkpoint/checkpoint-service.js";
import type { AgentRuntimePorts, AgentWorkflowRecord, ServiceContext } from "../types.js";

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) => code === "runtime.execute",
    ...overrides,
  };
}

function createRepo(): AgentWorkflowRepository {
  const workflows = new Map<string, AgentWorkflowRecord>();

  return {
    createWorkflow: async (input) => {
      const record: AgentWorkflowRecord = {
        ...input,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      };
      workflows.set(record.id, record);
      return record;
    },
    updateWorkflow: async (id, patch) => {
      const existing = workflows.get(id);
      if (!existing) throw new Error("missing");
      const updated = { ...existing, ...patch, updated_at: new Date().toISOString() };
      workflows.set(id, updated);
      return updated;
    },
    getWorkflow: async (id) => workflows.get(id) ?? null,
    listWorkflows: async () => [],
    saveCheckpoint: async () => {},
    loadLatestCheckpoint: async () => null,
    appendEvent: async (event) => ({
      ...event,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    }),
    listEvents: async () => [],
  };
}

function createPorts(): AgentRuntimePorts {
  return {
    toolRouter: {
      route: async () => ({
        executionId: "exec-1",
        status: "succeeded",
        output: { acknowledged: true },
      }),
    },
  };
}

describe("AgentExecutionEngine feature gating", () => {
  it("denies start when agents feature is off", async () => {
    const engine = new AgentExecutionEngine(createRepo(), createPorts());

    await assert.rejects(
      () =>
        engine.start(createContext({ isAgentsFeatureEnabled: () => false }), {
          companyId: "company-1",
          goal: "Create a customer named Test User",
        }),
      AgentsFeatureDisabledError,
    );
  });

  it("denies resume when agents feature is off", async () => {
    const repo = createRepo();
    const engine = new AgentExecutionEngine(repo, createPorts());
    const started = await engine.start(createContext(), {
      companyId: "company-1",
      goal: "Create a customer named Test User",
    });

    await assert.rejects(
      () => engine.resume(createContext({ isAgentsFeatureEnabled: () => false }), started.workflowId),
      AgentsFeatureDisabledError,
    );
  });

  it("denies getWorkflow when agents feature is off", async () => {
    const repo = createRepo();
    const engine = new AgentExecutionEngine(repo, createPorts());
    const started = await engine.start(createContext(), {
      companyId: "company-1",
      goal: "Create a customer named Test User",
    });

    await assert.rejects(
      () => engine.getWorkflow(createContext({ isAgentsFeatureEnabled: () => false }), started.workflowId),
      AgentsFeatureDisabledError,
    );
  });

  it("allows super-admin when agents feature is off", async () => {
    const engine = new AgentExecutionEngine(createRepo(), createPorts());

    const result = await engine.start(
      createContext({ isSuperAdmin: true, isAgentsFeatureEnabled: () => false }),
      {
        companyId: "company-1",
        goal: "Create a customer named Test User",
      },
    );

    assert.ok(result.workflowId);
  });

  it("allows start when agents feature lookup is missing (existing tenants)", async () => {
    const engine = new AgentExecutionEngine(createRepo(), createPorts());

    const result = await engine.start(createContext(), {
      companyId: "company-1",
      goal: "Create a customer named Test User",
    });

    assert.ok(result.workflowId);
  });
});
