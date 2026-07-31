import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENT_PERMISSIONS } from "../constants.js";
import { AgentsFeatureDisabledError, AgentsPermissionDeniedError } from "../errors.js";
import { AgentExecutionEngine } from "./agent-execution-engine.js";
import type { AgentWorkflowRepository } from "../checkpoint/checkpoint-service.js";
import { createInMemoryAgentWorkflowRepository } from "../checkpoint/in-memory-agent-workflow-repository.js";
import type { AgentRuntimePorts, AgentWorkflowRecord, ServiceContext } from "../types.js";

function createContext(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) =>
      code === AGENT_PERMISSIONS.view || code === AGENT_PERMISSIONS.execute,
    ...overrides,
  };
}

function createRepo(): AgentWorkflowRepository {
  return createInMemoryAgentWorkflowRepository().repo;
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

  it("denies start when agents.execute missing", async () => {
    const engine = new AgentExecutionEngine(createRepo(), createPorts());

    await assert.rejects(
      () =>
        engine.start(
          createContext({
            hasPermission: (code) => code === AGENT_PERMISSIONS.view,
          }),
          {
            companyId: "company-1",
            goal: "Create a customer named Test User",
          },
        ),
      AgentsPermissionDeniedError,
    );
  });

  it("denies resume when agents.execute missing", async () => {
    const repo = createRepo();
    const engine = new AgentExecutionEngine(repo, createPorts());
    const started = await engine.start(createContext(), {
      companyId: "company-1",
      goal: "Create a customer named Test User",
    });

    await assert.rejects(
      () =>
        engine.resume(
          createContext({
            hasPermission: (code) => code === AGENT_PERMISSIONS.view,
          }),
          started.workflowId,
        ),
      AgentsPermissionDeniedError,
    );
  });

  it("denies getWorkflow when agents.view missing", async () => {
    const repo = createRepo();
    const engine = new AgentExecutionEngine(repo, createPorts());
    const started = await engine.start(createContext(), {
      companyId: "company-1",
      goal: "Create a customer named Test User",
    });

    await assert.rejects(
      () =>
        engine.getWorkflow(
          createContext({
            hasPermission: (code) => code === AGENT_PERMISSIONS.execute,
          }),
          started.workflowId,
        ),
      AgentsPermissionDeniedError,
    );
  });

  it("denies listEvents when agents.view missing", async () => {
    const repo = createRepo();
    const engine = new AgentExecutionEngine(repo, createPorts());
    const started = await engine.start(createContext(), {
      companyId: "company-1",
      goal: "Create a customer named Test User",
    });

    await assert.rejects(
      () =>
        engine.listEvents(
          createContext({
            hasPermission: (code) => code === AGENT_PERMISSIONS.execute,
          }),
          started.workflowId,
        ),
      AgentsPermissionDeniedError,
    );
  });

  it("denies cancel when agents.execute missing", async () => {
    const repo = createRepo();
    const engine = new AgentExecutionEngine(repo, createPorts());
    const started = await engine.start(createContext(), {
      companyId: "company-1",
      goal: "Create a customer named Test User",
    });

    await assert.rejects(
      () =>
        engine.cancel(
          createContext({
            hasPermission: (code) => code === AGENT_PERMISSIONS.view,
          }),
          started.workflowId,
        ),
      AgentsPermissionDeniedError,
    );
  });

  it("allows super-admin when agents permissions missing", async () => {
    const engine = new AgentExecutionEngine(createRepo(), createPorts());

    const result = await engine.start(
      createContext({
        isSuperAdmin: true,
        hasPermission: () => false,
        isAgentsFeatureEnabled: () => false,
      }),
      {
        companyId: "company-1",
        goal: "Create a customer named Test User",
      },
    );

    assert.ok(result.workflowId);
  });

  it("allows start when agents permissions and feature lookup are missing (existing tenants)", async () => {
    const engine = new AgentExecutionEngine(createRepo(), createPorts());

    const result = await engine.start(createContext(), {
      companyId: "company-1",
      goal: "Create a customer named Test User",
    });

    assert.ok(result.workflowId);
  });

  it("cancels workflow when agents.execute granted", async () => {
    const engine = new AgentExecutionEngine(createRepo(), createPorts());
    const started = await engine.start(createContext(), {
      companyId: "company-1",
      goal: "Create a customer named Test User",
    });

    const cancelled = await engine.cancel(createContext(), started.workflowId);
    assert.equal(cancelled?.status, "cancelled");
  });
});

describe("AgentExecutionEngine manage gating", () => {
  it("denies listWorkflows when agents.view missing", async () => {
    const engine = new AgentExecutionEngine(createRepo(), createPorts());

    await assert.rejects(
      () =>
        engine.listWorkflows(
          createContext({
            hasPermission: (code) => code === AGENT_PERMISSIONS.execute,
          }),
          "company-1",
        ),
      AgentsPermissionDeniedError,
    );
  });

  it("denies listWorkflows when agents feature is off", async () => {
    const engine = new AgentExecutionEngine(createRepo(), createPorts());

    await assert.rejects(
      () =>
        engine.listWorkflows(createContext({ isAgentsFeatureEnabled: () => false }), "company-1"),
      AgentsFeatureDisabledError,
    );
  });

  it("lists workflows when agents.view granted", async () => {
    const repo = createRepo();
    const engine = new AgentExecutionEngine(repo, createPorts());
    await engine.start(createContext(), {
      companyId: "company-1",
      goal: "Create a customer named Test User",
    });

    const workflows = await engine.listWorkflows(
      createContext({
        hasPermission: (code) => code === AGENT_PERMISSIONS.view,
      }),
      "company-1",
    );

    assert.equal(workflows.length, 1);
  });

  it("denies deleteWorkflow when agents.manage missing", async () => {
    const repo = createRepo();
    const engine = new AgentExecutionEngine(repo, createPorts());
    const started = await engine.start(createContext(), {
      companyId: "company-1",
      goal: "Create a customer named Test User",
    });

    await assert.rejects(
      () =>
        engine.deleteWorkflow(
          createContext({
            hasPermission: (code) => code === AGENT_PERMISSIONS.execute,
          }),
          started.workflowId,
        ),
      AgentsPermissionDeniedError,
    );
  });

  it("deletes workflow when agents.manage granted", async () => {
    const repo = createRepo();
    const engine = new AgentExecutionEngine(repo, createPorts());
    const started = await engine.start(createContext(), {
      companyId: "company-1",
      goal: "Create a customer named Test User",
    });

    const deleted = await engine.deleteWorkflow(
      createContext({
        hasPermission: (code) => code === AGENT_PERMISSIONS.manage,
      }),
      started.workflowId,
    );

    assert.equal(deleted, true);
    assert.equal(await engine.getWorkflow(createContext(), started.workflowId), null);
  });

  it("allows super-admin delete regardless of manage permission", async () => {
    const repo = createRepo();
    const engine = new AgentExecutionEngine(repo, createPorts());
    const started = await engine.start(createContext(), {
      companyId: "company-1",
      goal: "Create a customer named Test User",
    });

    const superAdminContext = createContext({
      isSuperAdmin: true,
      hasPermission: () => false,
      isAgentsFeatureEnabled: () => false,
    });

    const deleted = await engine.deleteWorkflow(superAdminContext, started.workflowId);
    assert.equal(deleted, true);
  });
});
