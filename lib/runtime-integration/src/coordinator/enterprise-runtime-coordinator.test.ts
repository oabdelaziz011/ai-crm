import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PermissionDeniedError, ValidationError } from "../errors.js";
import { RUNTIME_PIPELINE_STAGES } from "../constants.js";
import { createContext, createTestEnvironment } from "./test-utils.js";

describe("EnterpriseRuntimeCoordinator", () => {
  it("executes the full runtime pipeline in order", async () => {
    const env = createTestEnvironment();
    const ctx = createContext();

    const response = await env.coordinator.execute(ctx, {
      companyId: "company-1",
      conversationId: "conv-1",
      messageText: "What is the security policy?",
      correlationId: "corr-runtime-1",
      knowledgeRetrieval: {
        embeddingConnectionId: "embed-conn-1",
        vectorStoreConnectionId: "conn-1",
        collectionId: "collection-1",
      },
    });

    assert.equal(response.correlationId, "corr-runtime-1");
    assert.equal(response.intentKey, "general_question");
    assert.equal(response.providerKey, "stub");
    assert.ok(response.responseContent.length > 0);
    assert.equal(response.steps.length, RUNTIME_PIPELINE_STAGES.length);

    const stageOrder = response.steps.map((step) => step.stage);
    assert.deepEqual(stageOrder, [...RUNTIME_PIPELINE_STAGES]);

    assert.equal(env.executions.length, 1);
    assert.equal(env.executions[0]?.execution_status, "completed");
    assert.equal(env.messages.length, 2);
    assert.equal(env.telemetryEvents.length, 1);
  });

  it("requires execute permission", async () => {
    const env = createTestEnvironment();
    const ctx = createContext({ hasPermission: (code) => code === "runtime.view" });

    await assert.rejects(
      () =>
        env.coordinator.execute(ctx, {
          companyId: "company-1",
          conversationId: "conv-1",
          messageText: "Hello",
        }),
      PermissionDeniedError,
    );
  });

  it("rejects empty messages", async () => {
    const env = createTestEnvironment();
    const ctx = createContext();

    await assert.rejects(
      () =>
        env.coordinator.execute(ctx, {
          companyId: "company-1",
          conversationId: "conv-1",
          messageText: "   ",
        }),
      ValidationError,
    );
  });

  it("skips retrieval when knowledge params are missing", async () => {
    const env = createTestEnvironment();
    const ctx = createContext();

    const response = await env.coordinator.execute(ctx, {
      companyId: "company-1",
      conversationId: "conv-1",
      messageText: "Hello",
    });

    const retrievalStep = response.steps.find((step) => step.stage === "retrieval");
    assert.equal(retrievalStep?.status, "skipped");
  });

  it("handles human escalation without AI execution", async () => {
    const env = createTestEnvironment();
    env.ports.intent.resolveIntent = async () => ({
      intentKey: "escalate",
      confidence: 1,
      matchedTool: null,
      reason: "human requested",
      requiresHuman: true,
      requiresLlm: false,
      status: "escalated",
    });
    const ctx = createContext();

    const response = await env.coordinator.execute(ctx, {
      companyId: "company-1",
      conversationId: "conv-1",
      messageText: "Talk to a human",
    });

    assert.match(response.responseContent, /human review/i);
    const executionStep = response.steps.find((step) => step.stage === "execution");
    assert.equal(executionStep?.status, "skipped");
  });

  it("records pipeline failures", async () => {
    const env = createTestEnvironment();
    env.ports.execution.execute = async () => {
      throw new Error("Execution failed");
    };
    const ctx = createContext();

    await assert.rejects(
      () =>
        env.coordinator.execute(ctx, {
          companyId: "company-1",
          conversationId: "conv-1",
          messageText: "Hello",
        }),
    );

    assert.equal(env.errors.length, 1);
    assert.equal(env.executions[0]?.execution_status, "failed");
  });
});
