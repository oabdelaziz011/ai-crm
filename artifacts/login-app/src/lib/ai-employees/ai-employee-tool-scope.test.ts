import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAgentEmployeeExecutionContext } from "./utilities/agent-employee-execution-context.js";
import { applyToolScopeBeforeRoute, createScopedRuntimeToolPort } from "./utilities/scoped-runtime-tool-port.js";
import {
  evaluateToolScope,
  EMPLOYEE_TOOL_SCOPE_DENIED_CODE,
} from "./utilities/tool-scope-filter.js";
import {
  registerConversationToolScope,
  runWithEmployeeToolScope,
} from "./utilities/tool-scope-context.js";

describe("evaluateToolScope", () => {
  it("passes through when employee scope is absent", () => {
    assert.deepEqual(
      evaluateToolScope({ toolKey: "create_customer", allowedToolKeys: null, employeeId: null }),
      { decision: "pass-through" },
    );
  });

  it("allows tools listed in ExecutionContext.allowedToolKeys", () => {
    const result = evaluateToolScope({
      toolKey: "knowledge_search",
      allowedToolKeys: ["knowledge_search"],
      employeeId: "agent-scope-1",
    });
    assert.equal(result.decision, "allow");
  });

  it("denies tools outside ExecutionContext.allowedToolKeys with structured payload", () => {
    const result = evaluateToolScope({
      toolKey: "create_customer",
      allowedToolKeys: ["knowledge_search"],
      employeeId: "agent-scope-1",
    });
    assert.equal(result.decision, "deny");
    if (result.decision !== "deny") return;
    assert.equal(result.denial.errorCode, EMPLOYEE_TOOL_SCOPE_DENIED_CODE);
    assert.equal(result.denial.toolKey, "create_customer");
    assert.equal(result.denial.employeeId, "agent-scope-1");
    assert.ok(result.denial.timestamp);
  });
});

describe("applyToolScopeBeforeRoute", () => {
  it("returns structured denial without calling ToolRouterService", async () => {
    let passThroughRouteCalled = false;
    const passThroughResult = await applyToolScopeBeforeRoute(
      {
        route: async () => {
          passThroughRouteCalled = true;
          return {
            executionId: "exec-pass-through",
            toolKey: "create_customer",
            status: "succeeded",
            output: { success: true },
            durationMs: 1,
            errorCode: null,
            errorMessage: null,
          };
        },
      },
      { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      {
        conversationId: "conversation-pass-through",
        toolKey: "create_customer",
        input: {},
      },
    );

    assert.equal(passThroughRouteCalled, true);
    assert.equal(passThroughResult.status, "succeeded");

    await runWithEmployeeToolScope(
      { allowedToolKeys: ["knowledge_search"], employeeId: "agent-scope-1" },
      async () => {
        let scopedRouteCalled = false;
        const denied = await applyToolScopeBeforeRoute(
          {
            route: async () => {
              scopedRouteCalled = true;
              throw new Error("ToolRouterService should not be called");
            },
          },
          { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
          {
            conversationId: "conversation-1",
            toolKey: "create_customer",
            input: {},
          },
        );

        assert.equal(scopedRouteCalled, false);
        assert.equal(denied.status, "failed");
        assert.equal(denied.errorCode, EMPLOYEE_TOOL_SCOPE_DENIED_CODE);
        assert.equal(denied.output?.toolKey, "create_customer");
        assert.equal(denied.output?.employeeId, "agent-scope-1");
      },
    );
  });

  it("passes allowed tools through to ToolRouterService", async () => {
    let routedToolKey: string | null = null;

    await runWithEmployeeToolScope(
      { allowedToolKeys: ["knowledge_search"], employeeId: "agent-scope-1" },
      async () => {
        const result = await applyToolScopeBeforeRoute(
          {
            route: async (_ctx, input) => {
              routedToolKey = input.toolKey;
              return {
                executionId: "exec-1",
                toolKey: input.toolKey,
                status: "succeeded",
                output: { success: true },
                durationMs: 2,
                errorCode: null,
                errorMessage: null,
              };
            },
          },
          { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
          {
            conversationId: "conversation-1",
            toolKey: "knowledge_search",
            input: { query: "policy" },
          },
        );

        assert.equal(routedToolKey, "knowledge_search");
        assert.equal(result.status, "succeeded");
      },
    );
  });

  it("uses conversation-scoped employee tool keys for direct agent routes", async () => {
    registerConversationToolScope("conversation-direct", {
      allowedToolKeys: ["search_customer"],
      employeeId: "agent-scope-1",
    });

    let routed = false;
    const result = await applyToolScopeBeforeRoute(
      {
        route: async () => {
          routed = true;
          return {
            executionId: "exec-2",
            toolKey: "search_customer",
            status: "succeeded",
            output: { success: true },
            durationMs: 1,
            errorCode: null,
            errorMessage: null,
          };
        },
      },
      { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      {
        conversationId: "conversation-direct",
        toolKey: "search_customer",
        input: {},
      },
    );

    assert.equal(routed, true);
    assert.equal(result.status, "succeeded");
  });
});

describe("createScopedRuntimeToolPort", () => {
  it("scopes allowedToolKeys from ExecutionContext only", () => {
    const basePort = {
      allowedToolKeys: () => ["knowledge_search", "search_customer", "create_customer"],
      listLlmTools: () => [
        { type: "function", function: { name: "knowledge_search" } },
        { type: "function", function: { name: "search_customer" } },
        { type: "function", function: { name: "create_customer" } },
      ],
      route: async () => ({
        executionId: "exec-1",
        toolKey: "knowledge_search",
        status: "succeeded",
        output: {},
        durationMs: 1,
        errorCode: null,
        errorMessage: null,
      }),
    };

    const scopedPort = createScopedRuntimeToolPort(basePort);

    runWithEmployeeToolScope(
      { allowedToolKeys: ["knowledge_search"], employeeId: "agent-scope-1" },
      () => {
        assert.deepEqual(scopedPort.allowedToolKeys(), ["knowledge_search"]);
        assert.equal(scopedPort.listLlmTools().length, 1);
      },
    );

    assert.deepEqual(scopedPort.allowedToolKeys(), [
      "knowledge_search",
      "search_customer",
      "create_customer",
    ]);
  });

  it("carries allowedToolKeys on ExecutionContext from runtime binding", () => {
    const channelRuntime = {
      providerConnectionId: "provider-conn-1",
      knowledgeRetrieval: null,
      executionPolicy: {
        streaming: false,
        maxDurationMs: 120_000,
        temperature: 0.7,
        maxTokens: 4096,
        retryCount: 1,
        rateLimitPerMinute: 60,
        maxConcurrency: 1,
      },
      pageContext: {
        aiEmployeeId: "agent-scope-1",
        aiEmployeeName: "Scope Agent",
        allowedToolKeys: ["knowledge_search", "search_customer"],
        systemPrompt: "Scoped agent",
      },
    };
    const executionContext = createAgentEmployeeExecutionContext(channelRuntime, {
      module: "customers",
    });
    assert.deepEqual(executionContext.allowedToolKeys, ["knowledge_search", "search_customer"]);
    assert.equal(Object.isFrozen(executionContext.allowedToolKeys), true);
  });
});
