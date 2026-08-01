import { RUNTIME_PIPELINE_STAGES } from "@workspace/runtime-integration";
import { createContext, createTestEnvironment } from "@workspace/runtime-integration/coordinator/test-utils";
import type { RuntimeExecutionRequest } from "@workspace/runtime-integration";
import {
  attachAgentEmployeeExecutionContext,
  createAgentEmployeeExecutionContext,
  readAgentEmployeeExecutionContext,
} from "../../../../lib/ai-employees/utilities/agent-employee-execution-context";
import { mergeEmployeePageContext } from "../../../../lib/ai-employees/utilities/merge-employee-page-context";
import { runWithEmployeeToolScope } from "../../../../lib/ai-employees/utilities/tool-scope-context";
import {
  createIntegrationChannelRuntime,
  createIntegrationEmployee,
  EMPLOYEE_PROVIDER_CONNECTION_ID,
} from "../fixtures/integration-fixtures";
import { IntegrationTelemetryCollector } from "./integration-telemetry-collector";

export type CoordinatorRuntimeHarness = ReturnType<typeof createCoordinatorRuntimeHarness>;

export function createCoordinatorRuntimeHarness(options?: {
  telemetry?: IntegrationTelemetryCollector;
}) {
  const telemetry = options?.telemetry ?? new IntegrationTelemetryCollector();
  const env = createTestEnvironment();
  const ctx = createContext();

  let capturedPromptPageContext: Record<string, unknown> | null = null;
  let capturedExecutionInput: {
    providerConnectionId?: string;
  } | null = null;

  const originalBuildPrompt = env.ports.prompt.buildPrompt;
  env.ports.prompt.buildPrompt = async (serviceCtx, input) => {
    capturedPromptPageContext = (input.pageContext as Record<string, unknown> | undefined) ?? null;
    telemetry.record({
      type: "runtime_chat_executed",
      employeeId: readAgentEmployeeExecutionContext(capturedPromptPageContext)?.aiEmployeeId ?? null,
      metadata: { phase: "coordinator_prompt" },
    });
    return originalBuildPrompt(serviceCtx, input);
  };

  const originalExecute = env.ports.execution.execute;
  env.ports.execution.execute = async (serviceCtx, input) => {
    capturedExecutionInput = {
      providerConnectionId: input.providerConnectionId ?? undefined,
    };
    telemetry.record({
      type: "provider_selected",
      providerConnectionId: input.providerConnectionId ?? null,
      metadata: { phase: "coordinator_execution" },
    });
    return originalExecute(serviceCtx, input);
  };

  async function executeWithEmployeeContext(input: {
    conversationId: string;
    messageText: string;
    pageContext: Record<string, unknown>;
    providerConnectionId: string;
    knowledgeRetrieval?: RuntimeExecutionRequest["knowledgeRetrieval"];
  }) {
    const executionContext = readAgentEmployeeExecutionContext(input.pageContext);
    const run = () =>
      env.coordinator.execute(ctx, {
        companyId: "company-1",
        conversationId: input.conversationId,
        messageText: input.messageText,
        providerConnectionId: input.providerConnectionId,
        pageContext: input.pageContext,
        knowledgeRetrieval: input.knowledgeRetrieval,
        correlationId: `corr-coordinator-${input.conversationId}`,
      });

    if (!executionContext) {
      return run();
    }

    return runWithEmployeeToolScope(
      {
        allowedToolKeys: executionContext.allowedToolKeys,
        employeeId: executionContext.aiEmployeeId,
      },
      run,
    );
  }

  function buildEmployeePageContext(conversationId: string) {
    const employee = createIntegrationEmployee();
    const channelRuntime = createIntegrationChannelRuntime(employee);
    const basePageContext = { module: "agents", conversationId };
    const mergedPageContext = mergeEmployeePageContext(basePageContext, channelRuntime);
    const executionContext = createAgentEmployeeExecutionContext(channelRuntime, mergedPageContext);
    const pageContext = attachAgentEmployeeExecutionContext(mergedPageContext, executionContext);
    return { employee, channelRuntime, pageContext, executionContext };
  }

  return {
    env,
    ctx,
    telemetry,
    get capturedPromptPageContext() {
      return capturedPromptPageContext;
    },
    get capturedExecutionInput() {
      return capturedExecutionInput;
    },
    buildEmployeePageContext,
    executeWithEmployeeContext,
    pipelineStages: RUNTIME_PIPELINE_STAGES,
  };
}
