import { AGENT_PERMISSIONS } from "@workspace/agent-runtime";
import { AgentExecutionEngine } from "@workspace/agent-runtime";
import { createInMemoryAgentWorkflowRepository } from "@workspace/agent-runtime";
import type { AgentRuntimePorts, AgentWorkflowRecord, ServiceContext } from "@workspace/agent-runtime";
import type { AgentRuntimeChannelBinding } from "../../../../lib/ai-employees/adapters/ai-employee-runtime-types";
import type { AiEmployeeRecord } from "../../../../lib/ai-employees/types/ai-employee-types";
import {
  attachAgentEmployeeExecutionContext,
  createAgentEmployeeExecutionContext,
  readAgentEmployeeExecutionContext,
} from "../../../../lib/ai-employees/utilities/agent-employee-execution-context";
import { mergeEmployeePageContext } from "../../../../lib/ai-employees/utilities/merge-employee-page-context";
import { applyToolScopeBeforeRoute } from "../../../../lib/ai-employees/utilities/scoped-runtime-tool-port";
import { EMPLOYEE_TOOL_SCOPE_DENIED_CODE } from "../../../../lib/ai-employees/utilities/tool-scope-filter";
import { registerConversationToolScope } from "../../../../lib/ai-employees/utilities/tool-scope-context";
import type {
  CapturedRuntimeChatCall,
  CapturedToolRouteCall,
} from "../types/ai-employee-integration-types";
import { IntegrationTelemetryCollector } from "./integration-telemetry-collector";

export type WorkflowStartHarnessInput = {
  companyId: string;
  conversationId: string;
  goal: string;
  aiEmployeeId?: string;
  basePageContext?: Record<string, unknown>;
  employee?: AiEmployeeRecord | null;
  channelRuntime?: AgentRuntimeChannelBinding | null;
  bindingResolver?: (companyId: string, aiEmployeeId: string) => Promise<AgentRuntimeChannelBinding | null>;
};

export type WorkflowStartHarnessResult = {
  pageContext: Record<string, unknown>;
  executionContext: ReturnType<typeof readAgentEmployeeExecutionContext>;
  resolveCount: number;
};

export type AgentWorkflowHarnessOptions = {
  telemetry?: IntegrationTelemetryCollector;
  bindingResolver?: (companyId: string, aiEmployeeId: string) => Promise<AgentRuntimeChannelBinding | null>;
  tenantProviderConnectionId?: string;
  onRuntimeChat?: (call: CapturedRuntimeChatCall) => void;
  onToolRoute?: (call: CapturedToolRouteCall) => void;
  toolRouterShouldExecute?: boolean;
  rbacPermissionCodes?: string[];
};

export type AgentWorkflowHarness = {
  engine: AgentExecutionEngine;
  repo: ReturnType<typeof createInMemoryAgentWorkflowRepository>["repo"];
  context: ServiceContext;
  telemetry: IntegrationTelemetryCollector;
  runtimeChatCalls: CapturedRuntimeChatCall[];
  toolRouteCalls: CapturedToolRouteCall[];
  resolveCount: number;
  prepareStart(input: WorkflowStartHarnessInput): Promise<WorkflowStartHarnessResult>;
  start(input: WorkflowStartHarnessInput & { userId?: string | null }): Promise<{
    workflowId: string;
    startResult: Awaited<ReturnType<AgentExecutionEngine["start"]>>;
    harnessStart: WorkflowStartHarnessResult;
  }>;
  getWorkflow(workflowId: string): Promise<AgentWorkflowRecord | null>;
  resume(workflowId: string, confirmationToken?: string): Promise<Awaited<ReturnType<AgentExecutionEngine["resume"]>>>;
  recover(workflowId: string): Promise<Awaited<ReturnType<AgentExecutionEngine["recover"]>>>;
  simulateAiTask(workflowId: string, conversationId: string): Promise<void>;
  routeTool(conversationId: string, toolKey: string): Promise<CapturedToolRouteCall | null>;
};

export function createIntegrationServiceContext(
  permissionCodes: string[] = [
    AGENT_PERMISSIONS.view,
    AGENT_PERMISSIONS.execute,
    "tools.execute",
    "customers.view",
    "customers.search",
    "knowledge.view",
  ],
): ServiceContext {
  return {
    userId: "user-integration-1",
    companyId: "company-integration-1",
    isSuperAdmin: false,
    hasPermission: (code) => permissionCodes.includes(code),
    isAgentsFeatureEnabled: () => true,
  };
}

export function createAgentWorkflowHarness(
  options: AgentWorkflowHarnessOptions = {},
): AgentWorkflowHarness {
  const telemetry = options.telemetry ?? new IntegrationTelemetryCollector();
  const { repo } = createInMemoryAgentWorkflowRepository();
  const runtimeChatCalls: CapturedRuntimeChatCall[] = [];
  const toolRouteCalls: CapturedToolRouteCall[] = [];
  let resolveCount = 0;

  const context = createIntegrationServiceContext(options.rbacPermissionCodes);

  async function prepareStart(input: WorkflowStartHarnessInput): Promise<WorkflowStartHarnessResult> {
    const basePageContext = input.basePageContext ?? { module: "customers" };
    let channelRuntime = input.channelRuntime ?? null;

    if (input.aiEmployeeId != null) {
      resolveCount += 1;
      telemetry.record({
        type: "employee_binding_resolved",
        employeeId: input.aiEmployeeId,
        metadata: { resolveCount },
      });

      if (input.bindingResolver) {
        channelRuntime = await input.bindingResolver(input.companyId, input.aiEmployeeId);
      } else if (input.channelRuntime != null && input.employee?.status === "published") {
        channelRuntime = input.channelRuntime;
      } else {
        channelRuntime = null;
      }
    }

    const mergedPageContext = mergeEmployeePageContext(basePageContext, channelRuntime);
    const pageContext =
      channelRuntime != null
        ? attachAgentEmployeeExecutionContext(
            mergedPageContext,
            createAgentEmployeeExecutionContext(channelRuntime, mergedPageContext),
          )
        : mergedPageContext;

    const executionContext = readAgentEmployeeExecutionContext(pageContext);
    if (executionContext) {
      telemetry.record({
        type: "execution_context_created",
        employeeId: executionContext.aiEmployeeId,
        providerConnectionId: executionContext.providerConnectionId,
        knowledgeCollectionId: executionContext.knowledgeRetrieval?.collectionId ?? null,
        metadata: {
          allowedToolKeys: [...executionContext.allowedToolKeys],
          frozen: Object.isFrozen(executionContext),
        },
      });
      registerConversationToolScope(input.conversationId, {
        allowedToolKeys: executionContext.allowedToolKeys,
        employeeId: executionContext.aiEmployeeId,
      });
    }

    return { pageContext, executionContext, resolveCount };
  }

  const ports: AgentRuntimePorts = {
    toolRouter: {
      async getRequiredPermissions(toolKey) {
        telemetry.record({
          type: "rbac_evaluated",
          toolKey,
          metadata: { phase: "preflight" },
        });
        if (toolKey === "search_customer") return ["tools.execute", "customers.view"];
        if (toolKey === "booking_search") return ["tools.execute", "customers.view"];
        if (toolKey === "find_duplicate_customers") return ["tools.execute", "customers.view"];
        if (toolKey === "merge_customers") return ["tools.execute", "customers.merge"];
        return ["tools.execute"];
      },
      async route(ctx, input) {
        const result = await applyToolScopeBeforeRoute(
          {
            route: async () => {
              telemetry.record({
                type: "tool_router_executed",
                employeeId: readAgentEmployeeExecutionContext(
                  runtimeChatCalls.at(-1)?.pageContext ?? {},
                )?.aiEmployeeId,
                toolKey: input.toolKey,
                allowed: true,
                denied: false,
              });

              if (options.toolRouterShouldExecute === false) {
                throw new Error("ToolRouterService should not execute");
              }

              const routeResult = {
                executionId: `tool-exec-${toolRouteCalls.length + 1}`,
                status: "succeeded" as const,
                output:
                  input.toolKey === "find_duplicate_customers"
                    ? { success: true, duplicates: [{ primaryId: "cust-1", duplicateIds: ["cust-2"] }] }
                    : { success: true, toolKey: input.toolKey },
                errorCode: null,
                errorMessage: null,
              };

              toolRouteCalls.push({
                toolKey: input.toolKey,
                status: routeResult.status,
                errorCode: routeResult.errorCode,
                rbacChecked: true,
              });
              options.onToolRoute?.(toolRouteCalls.at(-1)!);

              return {
                executionId: routeResult.executionId,
                toolKey: input.toolKey,
                status: routeResult.status,
                output: routeResult.output,
                durationMs: 1,
                errorCode: routeResult.errorCode,
                errorMessage: routeResult.errorMessage,
              };
            },
          },
          ctx,
          {
            conversationId: input.conversationId,
            toolKey: input.toolKey,
            input: input.input,
            triggeredBy: "agent",
          },
        );

        if (result.errorCode === EMPLOYEE_TOOL_SCOPE_DENIED_CODE) {
          telemetry.record({
            type: "tool_scope_decision",
            employeeId: (result.output as Record<string, unknown> | null)?.employeeId as string | undefined,
            toolKey: input.toolKey,
            allowed: false,
            denied: true,
            reason: result.errorMessage,
          });
          toolRouteCalls.push({
            toolKey: input.toolKey,
            status: result.status,
            errorCode: result.errorCode,
            rbacChecked: false,
          });
          options.onToolRoute?.(toolRouteCalls.at(-1)!);
        } else {
          telemetry.record({
            type: "tool_scope_decision",
            toolKey: input.toolKey,
            allowed: true,
            denied: false,
          });
        }

        return {
          executionId: result.executionId,
          status: result.status,
          output: result.output,
          errorMessage: result.errorMessage,
          errorCode: result.errorCode,
        };
      },
    },
    runtimeChat: {
      async execute(_ctx, input) {
        const executionContext = readAgentEmployeeExecutionContext(input.pageContext);
        const tenantProvider = options.tenantProviderConnectionId ?? "tenant-provider-default";
        const providerConnectionId = executionContext?.providerConnectionId ?? tenantProvider;

        telemetry.record({
          type: "provider_selected",
          employeeId: executionContext?.aiEmployeeId ?? null,
          providerConnectionId,
          metadata: { usedEmployeeProvider: providerConnectionId !== tenantProvider },
        });

        if (executionContext?.knowledgeRetrieval?.collectionId) {
          telemetry.record({
            type: "knowledge_retrieval_configured",
            employeeId: executionContext.aiEmployeeId,
            knowledgeCollectionId: executionContext.knowledgeRetrieval.collectionId,
            metadata: {
              embeddingConnectionId: executionContext.knowledgeRetrieval.embeddingConnectionId,
              vectorStoreConnectionId: executionContext.knowledgeRetrieval.vectorStoreConnectionId,
            },
          });
        }

        const call: CapturedRuntimeChatCall = {
          conversationId: input.conversationId,
          pageContext: input.pageContext ?? {},
          executionContext,
        };
        runtimeChatCalls.push(call);
        options.onRuntimeChat?.(call);

        telemetry.record({
          type: "runtime_chat_executed",
          employeeId: executionContext?.aiEmployeeId ?? null,
          metadata: { conversationId: input.conversationId },
        });

        return { responseContent: `[Integration Mock] ${input.messageText}` };
      },
    },
    knowledgeRetrieval: {
      retrieve: async () => ({
        contextText: "[1] Integration Policy\nEmployees must follow policy.",
        citations: [],
        chunks: [],
        confidence: 0.9,
        chunkCount: 1,
        totalTokens: 12,
        searchMode: "hybrid" as const,
        executionId: "knowledge-integration-1",
        vectorQueryExecutionId: "vq-integration-1",
      }),
    },
  };

  const engine = new AgentExecutionEngine(repo, ports);

  return {
    engine,
    repo,
    context,
    telemetry,
    runtimeChatCalls,
    toolRouteCalls,
    get resolveCount() {
      return resolveCount;
    },
    prepareStart,
    async start(input) {
      const harnessStart = await prepareStart(input);
      const startResult = await engine.start(context, {
        companyId: input.companyId,
        userId: input.userId ?? context.userId,
        conversationId: input.conversationId,
        goal: input.goal,
        pageContext: harnessStart.pageContext,
        agentType: "crm",
      });
      return { workflowId: startResult.workflowId, startResult, harnessStart };
    },
    getWorkflow: (workflowId) => repo.getWorkflow(workflowId),
    resume: (workflowId, confirmationToken) =>
      engine.resume(context, { workflowId, confirmationToken }),
    recover: (workflowId) => engine.recover(context, workflowId),
    simulateAiTask: async (workflowId, conversationId) => {
      const workflow = await repo.getWorkflow(workflowId);
      if (!workflow?.memory.executionState?.pageContext) return;
      await ports.runtimeChat!.execute(context, {
        companyId: workflow.company_id,
        conversationId,
        messageText: "[Integration simulated AI task]",
        pageContext: workflow.memory.executionState.pageContext as Record<string, unknown>,
      });
    },
    routeTool: async (conversationId, toolKey) => {
      const result = await ports.toolRouter!.route(context, {
        conversationId,
        toolKey,
        input: {},
      });
      const captured = toolRouteCalls.at(-1) ?? null;
      return captured;
    },
  };
}

export function readExecutionContextFromWorkflow(
  workflow: AgentWorkflowRecord | null | undefined,
): ReturnType<typeof readAgentEmployeeExecutionContext> {
  const pageContext = workflow?.memory.executionState?.pageContext as Record<string, unknown> | undefined;
  return readAgentEmployeeExecutionContext(pageContext);
}
