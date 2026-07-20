import type { AIWorkflowExecutionAdapter } from "../adapters/ai-workflow-execution-adapter.js";
import type { AIWorkflowServiceContext } from "../adapters/ai-workflow-execution-adapter.js";
import type { AIWorkflowRegistryBundle } from "../registries/index.js";
import { AIWorkflowNodeExecutor } from "./ai-workflow-node-executor.js";
import { isAIWorkflowActionConfig } from "./ai-workflow-node-executor.js";
import type {
  AIWorkflowAutomationContext,
  AIWorkflowNodeExecutionResult,
  WorkflowActionHandlerLike,
} from "../types/automation-context.js";

export type AIWorkflowRuntimeBridgeOptions = {
  registries: AIWorkflowRegistryBundle;
  adapter: AIWorkflowExecutionAdapter;
  resolveServiceContext: (executionContext: AIWorkflowAutomationContext) => AIWorkflowServiceContext;
  executor?: AIWorkflowNodeExecutor;
};

export function createAIWorkflowRuntimeBridge(options: AIWorkflowRuntimeBridgeOptions) {
  const executor =
    options.executor ??
    new AIWorkflowNodeExecutor({
      registries: options.registries,
      adapter: options.adapter,
    });

  return {
    isAIWorkflowNode(config: Record<string, unknown>): boolean {
      return isAIWorkflowActionConfig(config);
    },
    async executeNode(context: AIWorkflowAutomationContext): Promise<AIWorkflowNodeExecutionResult> {
      const serviceContext = options.resolveServiceContext(context);
      return executor.execute(context, serviceContext);
    },
  };
}

export function wrapActionHandlerWithAIWorkflow<T extends WorkflowActionHandlerLike>(
  baseHandler: T,
  bridge: ReturnType<typeof createAIWorkflowRuntimeBridge>,
): T {
  return {
    ...baseHandler,
    async validate(context) {
      if (isAIWorkflowActionConfig(context.currentNode.config)) return;
      await baseHandler.validate(context);
    },
    async execute(context) {
      if (bridge.isAIWorkflowNode(context.currentNode.config)) {
        return bridge.executeNode(context);
      }
      return baseHandler.execute(context);
    },
  };
}

export function wrapAutomationActionHandlerWithAIWorkflow<
  TContext extends { currentNode: { config: Record<string, unknown> } },
  TResult extends AIWorkflowNodeExecutionResult,
>(
  baseHandler: {
    type: "action";
    validate(context: TContext): void | Promise<void>;
    execute(context: TContext): TResult | Promise<TResult>;
  },
  bridge: ReturnType<typeof createAIWorkflowRuntimeBridge>,
  toAutomationContext: (context: TContext) => AIWorkflowAutomationContext,
): typeof baseHandler {
  return {
    ...baseHandler,
    async validate(context) {
      if (bridge.isAIWorkflowNode(context.currentNode.config)) return;
      await baseHandler.validate(context);
    },
    async execute(context) {
      if (bridge.isAIWorkflowNode(context.currentNode.config)) {
        return (await bridge.executeNode(toAutomationContext(context))) as unknown as TResult;
      }
      return baseHandler.execute(context);
    },
  };
}
