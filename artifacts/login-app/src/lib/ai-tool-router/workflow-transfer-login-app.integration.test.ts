/**
 * Phase 5I — Login-App transfer_to_workflow wiring + product gates.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ToolRouterService,
  createToolHandlerRegistry,
  createWorkflowTransferTools,
  listRegisteredToolHandlerKeys,
  type ConversationReader,
  type ToolDefinitionRepository,
  type ToolExecutionRepository,
  type WorkflowTransferStartWorkflowInput,
} from "@workspace/ai-tool-router";
import { createApplicationLayerWorkflowTransferToolPorts } from "@/lib/application-layer/application-layer-workflow-transfer-tool-ports";
import { resolveRequiredFeatureCodesForTool } from "@/lib/ai-employees/utilities/ai-employee-capability-catalog";
import { AI_EMPLOYEE_TOOL_SAFE_DENIAL_MESSAGE } from "@/lib/ai-employees/utilities/ai-employee-commercial-runtime-gate";
import { applyToolScopeBeforeRoute } from "@/lib/ai-employees/utilities/scoped-runtime-tool-port";
import { runWithEmployeeToolScope } from "@/lib/ai-employees/utilities/tool-scope-context";

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";
const FLOW_A = "flow-a";
const FLOW_B = "flow-b";
const CONV_A = "conv-a";
const EMPLOYEE_A = "employee-a";
const TOOL_KEY = "transfer_to_workflow";

function createMockClient(state: {
  conversationCompanyId?: string;
  conversationMetadata?: Record<string, unknown>;
  employeeAllowedTools?: string[];
  employeeFlowId?: string | null;
  session?: Record<string, unknown> | null;
  updateCalls?: Array<Record<string, unknown>>;
}) {
  const updateCalls = state.updateCalls ?? [];
  return {
    from(table: string) {
      if (table === "conversations") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: {
                      id: CONV_A,
                      company_id: state.conversationCompanyId ?? COMPANY_A,
                      metadata: state.conversationMetadata ?? { aiEmployeeId: EMPLOYEE_A },
                    },
                    error: null,
                  }),
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            return {
              eq() {
                return {
                  eq: async () => {
                    updateCalls.push(payload);
                    return { error: null };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "ai_employees") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      maybeSingle: async () => ({
                        data: {
                          id: EMPLOYEE_A,
                          runtime_configuration: {
                            transferableFlowId: state.employeeFlowId === undefined ? FLOW_A : state.employeeFlowId,
                          },
                          allowed_tool_keys: state.employeeAllowedTools ?? [TOOL_KEY],
                        },
                        error: null,
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "channel_sessions") {
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return {
                      limit() {
                        return {
                          maybeSingle: async () => ({
                            data:
                              state.session === null
                                ? null
                                : (state.session ?? {
                                    id: "session-1",
                                    channel_key: "whatsapp",
                                    company_channel_id: "cc-1",
                                    sender_external_id: "wa-user-1",
                                    external_thread_id: null,
                                  }),
                            error: null,
                          }),
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function createDefinitionRepository(): ToolDefinitionRepository {
  return {
    async findByKey(key) {
      if (key !== TOOL_KEY) return null;
      return {
        id: `def-${TOOL_KEY}`,
        key: TOOL_KEY,
        display_name: "Transfer To Workflow",
        description: "Transfer",
        category: "automation",
        version: "1.0.0",
        is_enabled: true,
        required_permissions: ["tools.execute"],
        supported_states: ["idle", "greeting", "collecting_information", "waiting_user", "waiting_api"],
        input_schema: {
          type: "object",
          properties: {
            reason: { type: "string", minLength: 1 },
            flowId: { type: "string" },
          },
          required: ["reason"],
        },
        output_schema: { type: "object" },
        timeout_ms: 5000,
        retry_policy: { maxAttempts: 1, backoffMs: 0 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    },
    async listEnabled() {
      return [];
    },
    async listAll() {
      return [];
    },
    async findById() {
      return null;
    },
    async updateEnabled() {
      throw new Error("unused");
    },
  };
}

function createExecutionRepository(): ToolExecutionRepository {
  return {
    async create(input) {
      return {
        id: "exec-1",
        company_id: input.companyId,
        conversation_id: input.conversationId,
        tool_definition_id: input.toolDefinitionId,
        tool_key: input.toolKey,
        input: input.input,
        triggered_by: input.triggeredBy,
        status: "running",
        output: null,
        error_code: null,
        error_message: null,
        duration_ms: null,
        started_at: new Date().toISOString(),
        completed_at: null,
        created_by: input.createdBy,
      };
    },
    async markRunning(executionId) {
      return {
        id: executionId,
        company_id: COMPANY_A,
        conversation_id: CONV_A,
        tool_definition_id: `def-${TOOL_KEY}`,
        tool_key: TOOL_KEY,
        input: {},
        triggered_by: "router",
        status: "running",
        output: null,
        error_code: null,
        error_message: null,
        duration_ms: null,
        started_at: new Date().toISOString(),
        completed_at: null,
        created_by: "actor-1",
      };
    },
    async complete(input) {
      return {
        id: input.executionId,
        company_id: COMPANY_A,
        conversation_id: CONV_A,
        tool_definition_id: `def-${TOOL_KEY}`,
        tool_key: TOOL_KEY,
        input: {},
        triggered_by: "router",
        status: input.status,
        output: input.output ?? null,
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage ?? null,
        duration_ms: input.durationMs ?? 1,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        created_by: "actor-1",
      };
    },
  };
}

function createConversationReader(companyId = COMPANY_A): ConversationReader {
  return {
    async findById(id) {
      if (id !== CONV_A) return null;
      return {
        id: CONV_A,
        company_id: companyId,
        state: "waiting_user",
        customer_id: "cust-1",
      };
    },
  };
}

describe("Phase 5I — Login-App transfer_to_workflow", () => {
  it("A — registers transfer_to_workflow in login-app ToolRouter options", () => {
    const client = createMockClient({}) as never;
    const ports = createApplicationLayerWorkflowTransferToolPorts(
      client,
      {
        companyId: COMPANY_A,
        actorUserId: "actor-1",
        isSuperAdmin: false,
        hasPermission: () => false,
      },
      {
        startWorkflow: async () => ({ runId: "run-1", responseContent: "ok" }),
      },
    );
    const keys = listRegisteredToolHandlerKeys({
      workflowTransferPorts: ports,
      includeMockTools: false,
    });
    assert.ok(keys.includes(TOOL_KEY));
  });

  it("B — ToolRouter routes to workflow port → startWorkflow bridge", async () => {
    const startCalls: WorkflowTransferStartWorkflowInput[] = [];
    const client = createMockClient({}) as never;
    const ports = createApplicationLayerWorkflowTransferToolPorts(
      client,
      {
        companyId: COMPANY_A,
        actorUserId: "actor-1",
        isSuperAdmin: false,
        hasPermission: () => false,
      },
      {
        startWorkflow: async (input) => {
          startCalls.push(input);
          return { runId: "run-bridge-1", responseContent: "مرحبا" };
        },
      },
    );

    const handlers = createWorkflowTransferTools(ports);
    const router = new ToolRouterService(
      createDefinitionRepository(),
      createExecutionRepository(),
      createConversationReader(),
      createToolHandlerRegistry({ [TOOL_KEY]: handlers[TOOL_KEY]! }),
    );

    const result = await router.route(
      {
        userId: "actor-1",
        companyId: COMPANY_A,
        isSuperAdmin: false,
        hasPermission: () => true,
      },
      {
        conversationId: CONV_A,
        toolKey: TOOL_KEY,
        input: { reason: "book appointment" },
      },
    );

    assert.equal(result.status, "succeeded");
    assert.equal(startCalls.length, 1);
    assert.equal(startCalls[0]?.companyId, COMPANY_A);
    assert.equal(startCalls[0]?.flowId, FLOW_A);
    assert.equal(result.output?.flowId, FLOW_A);
    assert.equal(result.output?.runId, "run-bridge-1");
  });

  it("C — TOOL_NOT_ASSIGNED when transfer_to_workflow missing from allowed_tool_keys", async () => {
    let routerCalled = false;
    const result = await runWithEmployeeToolScope(
      { allowedToolKeys: ["create_booking"], employeeId: EMPLOYEE_A },
      () =>
        applyToolScopeBeforeRoute(
          {
            route: async () => {
              routerCalled = true;
              return {
                executionId: "x",
                toolKey: TOOL_KEY,
                status: "succeeded",
                output: {},
                durationMs: 1,
                errorCode: null,
                errorMessage: null,
              };
            },
          },
          {
            userId: "actor-1",
            companyId: COMPANY_A,
            isSuperAdmin: false,
            hasPermission: () => true,
          },
          { conversationId: CONV_A, toolKey: TOOL_KEY, input: { reason: "x" } },
          {
            commercialEntitlement: {
              async isFeatureEnabled() {
                return true;
              },
            },
          },
        ),
    );
    assert.equal(routerCalled, false);
    assert.equal(result.status, "failed");
    assert.equal(result.errorCode, "TOOL_NOT_ASSIGNED");
  });

  it("D — FEATURE_NOT_ENTITLED without workflow_automation", async () => {
    let routerCalled = false;
    const result = await runWithEmployeeToolScope(
      { allowedToolKeys: [TOOL_KEY], employeeId: EMPLOYEE_A },
      () =>
        applyToolScopeBeforeRoute(
          {
            route: async () => {
              routerCalled = true;
              return {
                executionId: "x",
                toolKey: TOOL_KEY,
                status: "succeeded",
                output: {},
                durationMs: 1,
                errorCode: null,
                errorMessage: null,
              };
            },
          },
          {
            userId: "actor-1",
            companyId: COMPANY_A,
            isSuperAdmin: false,
            hasPermission: () => true,
          },
          { conversationId: CONV_A, toolKey: TOOL_KEY, input: { reason: "x" } },
          {
            commercialEntitlement: {
              async isFeatureEnabled(_companyId, featureCode) {
                return featureCode === "ai_employee";
              },
            },
          },
        ),
    );
    assert.equal(routerCalled, false);
    assert.equal(result.status, "failed");
    assert.equal(result.errorCode, "FEATURE_NOT_ENTITLED");
    assert.equal(result.errorMessage, AI_EMPLOYEE_TOOL_SAFE_DENIAL_MESSAGE);
    assert.deepEqual(resolveRequiredFeatureCodesForTool(TOOL_KEY), [
      "ai_employee",
      "workflow_automation",
    ]);
  });

  it("E — ai_employee + workflow_automation + assignment → bridge reached", async () => {
    const startCalls: WorkflowTransferStartWorkflowInput[] = [];
    const client = createMockClient({}) as never;
    const ports = createApplicationLayerWorkflowTransferToolPorts(
      client,
      {
        companyId: COMPANY_A,
        actorUserId: "actor-1",
        isSuperAdmin: false,
        hasPermission: () => false,
      },
      {
        startWorkflow: async (input) => {
          startCalls.push(input);
          return { runId: "run-e", responseContent: null };
        },
      },
    );
    const handlers = createWorkflowTransferTools(ports);
    const router = new ToolRouterService(
      createDefinitionRepository(),
      createExecutionRepository(),
      createConversationReader(),
      createToolHandlerRegistry({ [TOOL_KEY]: handlers[TOOL_KEY]! }),
    );

    const result = await runWithEmployeeToolScope(
      { allowedToolKeys: [TOOL_KEY], employeeId: EMPLOYEE_A },
      () =>
        applyToolScopeBeforeRoute(
          {
            route: (ctx, input) => router.route(ctx, input),
          },
          {
            userId: "actor-1",
            companyId: COMPANY_A,
            isSuperAdmin: false,
            hasPermission: () => true,
          },
          { conversationId: CONV_A, toolKey: TOOL_KEY, input: { reason: "transfer" } },
          {
            commercialEntitlement: {
              async isFeatureEnabled(_c, featureCode) {
                return featureCode === "ai_employee" || featureCode === "workflow_automation";
              },
            },
          },
        ),
    );

    assert.equal(result.status, "succeeded");
    assert.equal(startCalls.length, 1);
    assert.equal(startCalls[0]?.companyId, COMPANY_A);
  });

  it("F — missing trusted company context DENY", async () => {
    let routerCalled = false;
    const result = await runWithEmployeeToolScope(
      { allowedToolKeys: [TOOL_KEY], employeeId: EMPLOYEE_A },
      () =>
        applyToolScopeBeforeRoute(
          {
            route: async () => {
              routerCalled = true;
              return {
                executionId: "x",
                toolKey: TOOL_KEY,
                status: "succeeded",
                output: {},
                durationMs: 1,
                errorCode: null,
                errorMessage: null,
              };
            },
          },
          {
            userId: "actor-1",
            companyId: null,
            isSuperAdmin: false,
            hasPermission: () => true,
          },
          { conversationId: CONV_A, toolKey: TOOL_KEY, input: { reason: "x" } },
          {
            commercialEntitlement: {
              async isFeatureEnabled() {
                return true;
              },
            },
          },
        ),
    );
    assert.equal(routerCalled, false);
    assert.equal(result.status, "failed");
    assert.equal(result.errorCode, "TENANT_CONTEXT_REQUIRED");
  });

  it("G — cross-company workflow selection DENY (engine/domain)", async () => {
    const client = createMockClient({
      employeeFlowId: null,
      employeeAllowedTools: [TOOL_KEY],
    }) as never;
    const ports = createApplicationLayerWorkflowTransferToolPorts(
      client,
      {
        companyId: COMPANY_A,
        actorUserId: "actor-1",
        isSuperAdmin: false,
        hasPermission: () => false,
      },
      {
        startWorkflow: async (input) => {
          if (input.flowId === FLOW_B) {
            throw new Error("Permission denied: workflow belongs to another company");
          }
          return { runId: "run-ok", responseContent: null };
        },
      },
    );

    await assert.rejects(
      () =>
        ports.transferToWorkflow({
          companyId: COMPANY_A,
          conversationId: CONV_A,
          reason: "cross",
          flowId: FLOW_B,
        }),
      /another company|Permission denied/i,
    );
  });

  it("H — LLM cannot override trusted company via tool schema (no companyId input)", async () => {
    const startCalls: WorkflowTransferStartWorkflowInput[] = [];
    const client = createMockClient({}) as never;
    const ports = createApplicationLayerWorkflowTransferToolPorts(
      client,
      {
        companyId: COMPANY_A,
        actorUserId: "actor-1",
        isSuperAdmin: false,
        hasPermission: () => false,
      },
      {
        startWorkflow: async (input) => {
          startCalls.push(input);
          return { runId: "run-h", responseContent: null };
        },
      },
    );
    const handlers = createWorkflowTransferTools(ports);
    const tool = handlers[TOOL_KEY]!;
    await tool.execute(
      {
        companyId: COMPANY_A,
        conversationId: CONV_A,
        userId: "actor-1",
        conversationState: "waiting_user",
      },
      {
        reason: "ok",
        companyId: COMPANY_B,
        tenantId: COMPANY_B,
      },
    );
    assert.equal(startCalls.length, 1);
    assert.equal(startCalls[0]?.companyId, COMPANY_A);
  });

  it("H2 — trustedCompanyId mismatch DENY", async () => {
    const ports = createApplicationLayerWorkflowTransferToolPorts(
      createMockClient({}) as never,
      {
        companyId: COMPANY_A,
        actorUserId: "actor-1",
        isSuperAdmin: false,
        hasPermission: () => false,
      },
      {
        startWorkflow: async () => ({ runId: "x", responseContent: null }),
      },
    );
    await assert.rejects(
      () =>
        ports.transferToWorkflow({
          companyId: COMPANY_B,
          conversationId: CONV_A,
          reason: "override",
        }),
      /Company context mismatch/i,
    );
  });

  it("I — isSuperAdmin=true cannot bypass commercial / assignment / missing company", async () => {
    const cases = [
      {
        name: "missing assignment",
        allowedToolKeys: ["create_booking"] as const,
        companyId: COMPANY_A as string | null,
        entitled: true,
        expected: "TOOL_NOT_ASSIGNED",
      },
      {
        name: "missing entitlement",
        allowedToolKeys: [TOOL_KEY] as const,
        companyId: COMPANY_A as string | null,
        entitled: false,
        expected: "FEATURE_NOT_ENTITLED",
      },
      {
        name: "missing company",
        allowedToolKeys: [TOOL_KEY] as const,
        companyId: null as string | null,
        entitled: true,
        expected: "TENANT_CONTEXT_REQUIRED",
      },
    ];

    for (const testCase of cases) {
      let routerCalled = false;
      const result = await runWithEmployeeToolScope(
        { allowedToolKeys: [...testCase.allowedToolKeys], employeeId: EMPLOYEE_A },
        () =>
          applyToolScopeBeforeRoute(
            {
              route: async () => {
                routerCalled = true;
                return {
                  executionId: "x",
                  toolKey: TOOL_KEY,
                  status: "succeeded",
                  output: {},
                  durationMs: 1,
                  errorCode: null,
                  errorMessage: null,
                };
              },
            },
            {
              userId: "actor-1",
              companyId: testCase.companyId,
              isSuperAdmin: true,
              hasPermission: () => true,
            },
            { conversationId: CONV_A, toolKey: TOOL_KEY, input: { reason: "x" } },
            {
              commercialEntitlement: {
                async isFeatureEnabled() {
                  return testCase.entitled;
                },
              },
            },
          ),
      );
      assert.equal(routerCalled, false, testCase.name);
      assert.equal(result.errorCode, testCase.expected, testCase.name);
    }
  });

  it("end-to-end Login-App: scope → commercial → ToolRouter → workflow bridge", async () => {
    const startCalls: WorkflowTransferStartWorkflowInput[] = [];
    const ports = createApplicationLayerWorkflowTransferToolPorts(
      createMockClient({}) as never,
      {
        companyId: COMPANY_A,
        actorUserId: "actor-1",
        isSuperAdmin: false,
        hasPermission: () => false,
      },
      {
        startWorkflow: async (input) => {
          startCalls.push(input);
          return { runId: "run-e2e", responseContent: "done" };
        },
      },
    );

    assert.ok(
      listRegisteredToolHandlerKeys({
        workflowTransferPorts: ports,
        includeMockTools: false,
      }).includes(TOOL_KEY),
    );

    const handlers = createWorkflowTransferTools(ports);
    const router = new ToolRouterService(
      createDefinitionRepository(),
      createExecutionRepository(),
      createConversationReader(),
      createToolHandlerRegistry({ [TOOL_KEY]: handlers[TOOL_KEY]! }),
    );

    const result = await runWithEmployeeToolScope(
      { allowedToolKeys: [TOOL_KEY], employeeId: EMPLOYEE_A },
      () =>
        applyToolScopeBeforeRoute(
          { route: (ctx, input) => router.route(ctx, input) },
          {
            userId: "actor-1",
            companyId: COMPANY_A,
            isSuperAdmin: false,
            hasPermission: () => true,
          },
          {
            conversationId: CONV_A,
            toolKey: TOOL_KEY,
            input: { reason: "e2e", companyId: COMPANY_B },
          },
          {
            commercialEntitlement: {
              async isFeatureEnabled(_c, featureCode) {
                return featureCode === "ai_employee" || featureCode === "workflow_automation";
              },
            },
          },
        ),
    );

    assert.equal(result.status, "succeeded");
    assert.equal(startCalls.length, 1);
    assert.equal(startCalls[0]?.companyId, COMPANY_A);
    assert.equal(startCalls[0]?.flowId, FLOW_A);
    assert.equal(result.output?.runId, "run-e2e");
  });
});
