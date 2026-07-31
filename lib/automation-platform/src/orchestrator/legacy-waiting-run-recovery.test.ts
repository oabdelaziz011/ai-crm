import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AutomationRunRecord, ConversationSessionRecord } from "../types.js";
import { AutomationEngine } from "../engine/automation-engine.js";
import { createDefaultAutomationNodeRegistry } from "../engine/node-registry.js";
import {
  canResumeWaitingRun,
  hasValidWaitingRunState,
  isStaleWaitingRun,
  STALE_WAITING_RUN_REASON,
} from "./session-policy.js";

function createContext() {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code: string) => ["automation.execute", "automation.view"].includes(code),
  };
}

function legacyWaitingSession(overrides?: Partial<ConversationSessionRecord>): ConversationSessionRecord {
  return {
    id: "3cf4d0f7-9de0-44be-9be4-7daaf5967f8d",
    company_id: "company-1",
    channel: "whatsapp",
    external_user_id: "201011404109",
    customer_id: null,
    flow_id: "aef7c4ab-513a-4b64-a700-2be6cf51dafc",
    flow_version_id: "9462b47c-eb94-4ea2-9a39-04fdd78efa6d",
    run_id: "4af7ad99-be95-4d65-ab8e-2af1ca480431",
    current_node_id: null,
    status: "waiting_input",
    started_at: "2026-07-23T20:07:28.044416+00:00",
    last_activity_at: "2026-07-23T20:07:29.288+00:00",
    metadata: {},
    variables: {
      __waitingFor: "interactive_selection",
      __outbound: { kind: "buttons", text: "please press on what you want" },
    },
    ...overrides,
  };
}

function legacyWaitingRun(overrides?: Partial<AutomationRunRecord>): AutomationRunRecord {
  return {
    id: "4af7ad99-be95-4d65-ab8e-2af1ca480431",
    company_id: "company-1",
    flow_id: "aef7c4ab-513a-4b64-a700-2be6cf51dafc",
    status: "waiting_input",
    trigger_source: "inbound_message",
    started_at: "2026-07-23T20:07:27.800761+00:00",
    finished_at: null,
    error_message: null,
    metadata: { flowVersionId: "9462b47c-eb94-4ea2-9a39-04fdd78efa6d" },
    flow_version_id: "9462b47c-eb94-4ea2-9a39-04fdd78efa6d",
    current_node_id: null,
    session_id: "3cf4d0f7-9de0-44be-9be4-7daaf5967f8d",
    variables: {
      __waitingFor: "interactive_selection",
      __outbound: { kind: "buttons", text: "please press on what you want" },
    },
    ...overrides,
  };
}

describe("legacy waiting run recovery", () => {
  it("classifies version-pinned waiting runs with null current_node_id as stale", () => {
    const session = legacyWaitingSession();
    const run = legacyWaitingRun();

    assert.equal(hasValidWaitingRunState(session, run), false);
    assert.equal(canResumeWaitingRun(session, run), false);
    assert.equal(isStaleWaitingRun(session, run), true);
  });

  it("still allows resume when waiting pins are intact", () => {
    const session = legacyWaitingSession({
      current_node_id: "fb7ac8f1-16d8-42d9-9896-b748bf313f66",
    });
    const run = legacyWaitingRun({
      current_node_id: "fb7ac8f1-16d8-42d9-9896-b748bf313f66",
    });

    assert.equal(hasValidWaitingRunState(session, run), true);
    assert.equal(canResumeWaitingRun(session, run), true);
    assert.equal(isStaleWaitingRun(session, run), false);
  });

  it("abandons stale waiting runs without requiring current_node_id", async () => {
    const session = legacyWaitingSession();
    const run = legacyWaitingRun();
    const runs = [structuredClone(run)];
    const sessions = [structuredClone(session)];

    const engine = new AutomationEngine({
      flows: {
        findById: async () => null,
        create: async () => {
          throw new Error("not used");
        },
        update: async () => {
          throw new Error("not used");
        },
        updateStatus: async () => {
          throw new Error("not used");
        },
        softDelete: async () => {
          throw new Error("not used");
        },
        findByName: async () => null,
        list: async () => [],
      },
      runs: {
        findById: async (id) => runs.find((item) => item.id === id) ?? null,
        findBySessionId: async (sessionId) => runs.find((item) => item.session_id === sessionId) ?? null,
        create: async () => {
          throw new Error("not used");
        },
        list: async () => [...runs],
        updateState: async (input) => {
          const record = runs.find((item) => item.id === input.runId)!;
          if (input.status !== undefined) record.status = input.status;
          if (input.currentNodeId !== undefined) record.current_node_id = input.currentNodeId;
          if (input.variables !== undefined) record.variables = input.variables;
          if (input.errorMessage !== undefined) record.error_message = input.errorMessage;
          if (input.finishedAt !== undefined) record.finished_at = input.finishedAt;
          return { ...record };
        },
      },
      sessions: {
        findById: async (id) => sessions.find((item) => item.id === id) ?? null,
        findActiveSession: async () => null,
        create: async () => {
          throw new Error("not used");
        },
        list: async () => [...sessions],
        updateState: async (input) => {
          const record = sessions.find((item) => item.id === input.sessionId)!;
          if (input.status !== undefined) record.status = input.status;
          if (input.currentNodeId !== undefined) record.current_node_id = input.currentNodeId;
          if (input.variables !== undefined) record.variables = input.variables;
          record.last_activity_at = input.lastActivityAt ?? new Date().toISOString();
          return { ...record };
        },
      },
      versions: {
        findById: async () => null,
        findByFlowAndNumber: async () => null,
        findActiveByFlowId: async () => null,
        listByFlowId: async () => [],
        create: async () => {
          throw new Error("not used");
        },
        setActiveVersion: async () => {
          throw new Error("not used");
        },
        getNextVersionNumber: async () => 1,
      },
      versionGraph: {
        materialize: async () => {
          throw new Error("not used");
        },
        hasNode: async () => false,
        listExecutionGraph: async () => ({ nodes: [], edges: [] }),
      },
      registry: createDefaultAutomationNodeRegistry(),
    });

    const result = await engine.abandonStaleWaitingRun(createContext(), { runId: run.id });

    assert.equal(result?.lifecycle, "cancelled");
    assert.equal(runs[0]?.status, "cancelled");
    assert.equal(sessions[0]?.status, "cancelled");
    assert.equal(runs[0]?.current_node_id, null);
    assert.equal(runs[0]?.error_message, STALE_WAITING_RUN_REASON);
    assert.equal(runs[0]?.variables.__abandonedReason, STALE_WAITING_RUN_REASON);
  });

  it("abandons non-terminal running orphans via abandonActiveRun", async () => {
    const session = legacyWaitingSession({ status: "running", current_node_id: "node-dates" });
    const run = legacyWaitingRun({
      status: "running",
      current_node_id: "node-dates",
      variables: {},
    });
    const runs = [structuredClone(run)];
    const sessions = [structuredClone(session)];

    const engine = new AutomationEngine({
      flows: {
        findById: async () => null,
        create: async () => {
          throw new Error("not used");
        },
        update: async () => {
          throw new Error("not used");
        },
        updateStatus: async () => {
          throw new Error("not used");
        },
        softDelete: async () => {
          throw new Error("not used");
        },
        findByName: async () => null,
        list: async () => [],
      },
      runs: {
        findById: async (id) => runs.find((item) => item.id === id) ?? null,
        findBySessionId: async (sessionId) => runs.find((item) => item.session_id === sessionId) ?? null,
        create: async () => {
          throw new Error("not used");
        },
        list: async () => [...runs],
        updateState: async (input) => {
          const record = runs.find((item) => item.id === input.runId)!;
          if (input.status !== undefined) record.status = input.status;
          if (input.currentNodeId !== undefined) record.current_node_id = input.currentNodeId;
          if (input.variables !== undefined) record.variables = input.variables;
          if (input.errorMessage !== undefined) record.error_message = input.errorMessage;
          if (input.finishedAt !== undefined) record.finished_at = input.finishedAt;
          return { ...record };
        },
      },
      sessions: {
        findById: async (id) => sessions.find((item) => item.id === id) ?? null,
        findActiveSession: async () => null,
        create: async () => {
          throw new Error("not used");
        },
        list: async () => [...sessions],
        updateState: async (input) => {
          const record = sessions.find((item) => item.id === input.sessionId)!;
          if (input.status !== undefined) record.status = input.status;
          if (input.currentNodeId !== undefined) record.current_node_id = input.currentNodeId;
          if (input.variables !== undefined) record.variables = input.variables;
          record.last_activity_at = input.lastActivityAt ?? new Date().toISOString();
          return { ...record };
        },
      },
      versions: {
        findById: async () => null,
        findByFlowAndNumber: async () => null,
        findActiveByFlowId: async () => null,
        listByFlowId: async () => [],
        create: async () => {
          throw new Error("not used");
        },
        setActiveVersion: async () => {
          throw new Error("not used");
        },
        getNextVersionNumber: async () => 1,
      },
      versionGraph: {
        materialize: async () => {
          throw new Error("not used");
        },
        hasNode: async () => false,
        listExecutionGraph: async () => ({ nodes: [], edges: [] }),
      },
      registry: createDefaultAutomationNodeRegistry(),
    });

    const result = await engine.abandonActiveRun(createContext(), {
      runId: run.id,
      reason: "orphaned_active_run_not_waiting_for_input",
    });

    assert.equal(result?.lifecycle, "cancelled");
    assert.equal(runs[0]?.status, "cancelled");
    assert.equal(sessions[0]?.status, "cancelled");
  });

  it("rejects resume for legacy orphan waiting runs in the engine", async () => {
    const run = legacyWaitingRun();
    const engine = new AutomationEngine({
      flows: {
        findById: async () => null,
        create: async () => {
          throw new Error("not used");
        },
        update: async () => {
          throw new Error("not used");
        },
        updateStatus: async () => {
          throw new Error("not used");
        },
        softDelete: async () => {
          throw new Error("not used");
        },
        findByName: async () => null,
        list: async () => [],
      },
      runs: {
        findById: async () => run,
        findBySessionId: async () => run,
        create: async () => {
          throw new Error("not used");
        },
        list: async () => [run],
        updateState: async () => ({ ...run }),
      },
      sessions: {
        findById: async () => legacyWaitingSession(),
        findActiveSession: async () => null,
        create: async () => {
          throw new Error("not used");
        },
        list: async () => [],
        updateState: async () => legacyWaitingSession(),
      },
      versions: {
        findById: async () => null,
        findByFlowAndNumber: async () => null,
        findActiveByFlowId: async () => null,
        listByFlowId: async () => [],
        create: async () => {
          throw new Error("not used");
        },
        setActiveVersion: async () => {
          throw new Error("not used");
        },
        getNextVersionNumber: async () => 1,
      },
      versionGraph: {
        materialize: async () => {
          throw new Error("not used");
        },
        hasNode: async () => false,
        listExecutionGraph: async () => ({ nodes: [], edges: [] }),
      },
      registry: createDefaultAutomationNodeRegistry(),
    });

    await assert.rejects(
      () => engine.resume(createContext(), { runId: run.id, input: { reply: "Book now" } }),
      /missing session or current node state/,
    );
  });
});
