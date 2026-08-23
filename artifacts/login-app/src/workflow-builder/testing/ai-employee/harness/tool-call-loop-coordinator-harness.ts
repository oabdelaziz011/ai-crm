import {
  ToolCallLoopService,
  type RuntimeGatewayPort,
  type RuntimeToolPort,
} from "@workspace/ai-execution-engine";
import { createContext, createTestEnvironment } from "@workspace/runtime-integration/coordinator/test-utils";
import { TOOL_NOT_ALLOWED_CODE } from "@workspace/ai-execution-engine";
import {
  attachAgentEmployeeExecutionContext,
  createAgentEmployeeExecutionContext,
} from "../../../../lib/ai-employees/utilities/agent-employee-execution-context";
import { createScopedRuntimeToolPort } from "../../../../lib/ai-employees/utilities/scoped-runtime-tool-port";
import { TOOL_NOT_ASSIGNED_CODE } from "../../../../lib/ai-employees/utilities/tool-scope-filter";
import { mergeEmployeePageContext } from "../../../../lib/ai-employees/utilities/merge-employee-page-context";
import { registerConversationToolScope, runWithEmployeeToolScope } from "../../../../lib/ai-employees/utilities/tool-scope-context";
import { createIntegrationChannelRuntime, createIntegrationEmployee } from "../fixtures/integration-fixtures";

export type ToolCallLoopCoordinatorHarness = ReturnType<typeof createToolCallLoopCoordinatorHarness>;

const ALWAYS_ENTITLED = {
  async isFeatureEnabled() {
    return true;
  },
};

export function createToolCallLoopCoordinatorHarness(conversationId = "conv-tool-loop-e2e") {
  const env = createTestEnvironment();
  const ctx = createContext();
  const employee = createIntegrationEmployee();
  const channelRuntime = createIntegrationChannelRuntime(employee);
  const mergedPageContext = mergeEmployeePageContext({ module: "agents" }, channelRuntime);
  const executionContext = createAgentEmployeeExecutionContext(channelRuntime, mergedPageContext);
  const pageContext = attachAgentEmployeeExecutionContext(mergedPageContext, executionContext);

  registerConversationToolScope(conversationId, {
    allowedToolKeys: executionContext.allowedToolKeys,
    employeeId: executionContext.aiEmployeeId,
  });

  let routerCallCount = 0;
  const routerCalls: string[] = [];
  const toolMessages: Array<Record<string, unknown>> = [];

  const baseToolPort: RuntimeToolPort = {
    allowedToolKeys: () => ["search_customer", "booking_search", "knowledge_search"],
    listLlmTools: () => [
      { type: "function", function: { name: "search_customer" } },
      { type: "function", function: { name: "booking_search" } },
      { type: "function", function: { name: "knowledge_search" } },
    ],
    route: async (_serviceCtx, input) => {
      routerCallCount += 1;
      routerCalls.push(input.toolKey);
      return {
        executionId: `router-exec-${routerCallCount}`,
        toolKey: input.toolKey,
        status: "succeeded",
        output: { success: true, toolKey: input.toolKey },
        durationMs: 1,
        errorCode: null,
        errorMessage: null,
      };
    },
  };

  const scopedToolPort = createScopedRuntimeToolPort(baseToolPort, {
    commercialEntitlement: ALWAYS_ENTITLED,
  });

  function buildGateway(
    toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
  ): RuntimeGatewayPort {
    let callCount = 0;
    return {
      async chatCompletion(input) {
        callCount += 1;
        if (callCount === 1 && input.tools?.length) {
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 },
            latencyMs: 1,
            toolCalls,
          };
        }

        return {
          text: "Tool loop completed.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
          latencyMs: 1,
        };
      },
    };
  }

  async function runToolLoop(
    toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
    options?: { includeOutOfScopeToolKeys?: string[] },
  ) {
    routerCallCount = 0;
    routerCalls.length = 0;
    toolMessages.length = 0;

    const gateway = buildGateway(toolCalls);
    const loop = new ToolCallLoopService({ gateway, tools: scopedToolPort });
    const extraToolKeys = options?.includeOutOfScopeToolKeys ?? [];
    const allowedToolKeys = [...scopedToolPort.allowedToolKeys(), ...extraToolKeys];
    const tools = [
      ...scopedToolPort.listLlmTools(),
      ...extraToolKeys.map((toolKey) => ({ type: "function", function: { name: toolKey } })),
    ];

    return runWithEmployeeToolScope(
      {
        allowedToolKeys: executionContext.allowedToolKeys,
        employeeId: executionContext.aiEmployeeId,
      },
      () =>
        loop.run({
          ctx,
          conversationId,
          gatewayRequest: {
            messages: [{ role: "user", content: "Run CRM tool" }],
            providerKey: "mock",
            model: "mock-gpt",
            context: { companyId: "company-1", conversationId },
          },
          tools,
          allowedToolKeys,
        }),
    );
  }

  async function runThroughCoordinator(
    toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
  ) {
    routerCallCount = 0;
    routerCalls.length = 0;

    const gateway = buildGateway(toolCalls);
    const loop = new ToolCallLoopService({ gateway, tools: scopedToolPort });

    env.ports.execution.execute = async () => {
      const loopResult = await runWithEmployeeToolScope(
        {
          allowedToolKeys: executionContext.allowedToolKeys,
          employeeId: executionContext.aiEmployeeId,
        },
        () =>
          loop.run({
            ctx,
            conversationId,
            gatewayRequest: {
              messages: [{ role: "user", content: "Run CRM tool via coordinator" }],
              providerKey: "mock",
              model: "mock-gpt",
              context: { companyId: "company-1", conversationId },
            },
            tools: scopedToolPort.listLlmTools(),
            allowedToolKeys: scopedToolPort.allowedToolKeys(),
          }),
      );

      for (const message of loopResult.messages) {
        if (message.role === "tool" && typeof message.content === "string") {
          try {
            toolMessages.push(JSON.parse(message.content) as Record<string, unknown>);
          } catch {
            toolMessages.push({ raw: message.content });
          }
        }
      }

      return {
        executionId: "ai-exec-tool-loop",
        providerKey: "stub",
        model: "stub-model",
        status: "completed",
        latencyMs: 5,
        tokenUsage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 },
        responseContent: loopResult.response.text,
      };
    };

    const response = await runWithEmployeeToolScope(
      {
        allowedToolKeys: executionContext.allowedToolKeys,
        employeeId: executionContext.aiEmployeeId,
      },
      () =>
        env.coordinator.execute(ctx, {
          companyId: "company-1",
          conversationId,
          messageText: "Run CRM tool via coordinator",
          providerConnectionId: executionContext.providerConnectionId,
          pageContext,
          correlationId: "corr-tool-loop-e2e",
        }),
    );

    return { response, loopMessages: toolMessages };
  }

  return {
    env,
    ctx,
    pageContext,
    executionContext,
    get routerCallCount() {
      return routerCallCount;
    },
    get routerCalls() {
      return [...routerCalls];
    },
    get toolMessages() {
      return [...toolMessages];
    },
    runToolLoop,
    runThroughCoordinator,
    denialCodes: {
      toolNotAllowed: TOOL_NOT_ALLOWED_CODE,
      employeeScopeDenied: TOOL_NOT_ASSIGNED_CODE,
    },
  };
}
