import {
  AutomationNodeRegistry,
  createBuiltInAutomationNodeHandlers,
  type AutomationActionDeps,
  type AutomationNodeHandler,
} from "@workspace/automation-platform";
import { actionNodeHandler } from "@workspace/automation-platform";
import {
  createAIWorkflowRuntimeBridge,
  wrapAutomationActionHandlerWithAIWorkflow,
} from "@workspace/ai-workflow-platform";
import { toAIWorkflowAutomationContext } from "./automation-bridge";

type AIWorkflowRuntimeBridge = ReturnType<typeof createAIWorkflowRuntimeBridge>;

export function createAutomationRegistryWithAIWorkflow(
  bridge: AIWorkflowRuntimeBridge,
  deps?: AutomationActionDeps,
): AutomationNodeRegistry {
  const handlers = createBuiltInAutomationNodeHandlers(deps).map((handler) => {
    if (handler.type !== "action") return handler;
    return wrapAutomationActionHandlerWithAIWorkflow(
      handler as Extract<AutomationNodeHandler, { type: "action" }>,
      bridge,
      toAIWorkflowAutomationContext,
    );
  });
  return new AutomationNodeRegistry().registerMany(handlers);
}

export function wrapAutomationActionHandler(
  bridge: AIWorkflowRuntimeBridge,
  baseHandler: AutomationNodeHandler = actionNodeHandler,
): AutomationNodeHandler {
  if (baseHandler.type !== "action") {
    throw new Error("Only action node handlers can be wrapped for AI workflow execution.");
  }
  return wrapAutomationActionHandlerWithAIWorkflow(
    baseHandler as Extract<AutomationNodeHandler, { type: "action" }>,
    bridge,
    toAIWorkflowAutomationContext,
  );
}
